// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeAdminApi } from '../api/FakeAdminApi';
import type { Role } from '../api/types';
import { SETTLE_MS } from '../hooks/useEvents';
import { ConferencesScreen, ROOMS_POLL_MS, roomName, sinceJoined } from './ConferencesScreen';

const ROOM = 'sip:conf-sales@sip.athenasip.org';
const ALL: Role[] = ['view-cluster-status', 'manage-cluster'];

function show(api: FakeAdminApi, roles: Role[] = ALL) {
  return render(<MemoryRouter><ConferencesScreen api={api} roles={roles} /></MemoryRouter>);
}

const settle = (ms = 0) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

describe('roomName and sinceJoined', () => {
  it('names a room by the user part of its URI', () => {
    expect(roomName(ROOM)).toBe('conf-sales');
    expect(roomName('sips:8100@example.com;transport=tls')).toBe('8100');
  });

  it('counts minutes and seconds, and hours once there are some', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(sinceJoined('2026-10-26T11:58:55Z', now)).toBe('1:05');
    expect(sinceJoined('2026-10-26T10:59:00Z', now)).toBe('1:01:00');
  });
});

describe('ConferencesScreen', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('lists each room with its focus and who is in it', async () => {
    show(new FakeAdminApi());
    const room = await screen.findByRole('region', { name: `Room ${ROOM}` });
    expect(within(room).getByRole('heading', { name: 'conf-sales' })).toBeTruthy();
    expect(within(room).getByRole('link', { name: 'rooms' })).toBeTruthy();
    expect(within(room).getByRole('group', { name: 'sip:tom@sip.athenasip.org' })).toBeTruthy();
    expect(within(room).getByRole('group', { name: 'sip:tomweb@sip.athenasip.org' })).toBeTruthy();
    expect(room.textContent).toContain('2 of 2 connected');
  });

  it('says so when nobody is in a conference', async () => {
    const api = new FakeAdminApi();
    api.endCallElsewhere('c0nf1@192.168.1.24');
    api.endCallElsewhere('c0nf2@203.0.113.40');
    show(api);
    expect(await screen.findByText('Nobody is in a conference.')).toBeTruthy();
  });

  it('offers Remove only with manage-cluster', async () => {
    show(new FakeAdminApi(), ['view-cluster-status']);
    await screen.findByRole('region', { name: `Room ${ROOM}` });
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('removes a participant after asking, leaving the rest of the room', async () => {
    const api = new FakeAdminApi();
    const remove = vi.spyOn(api, 'removeConferenceParticipant');
    show(api);
    const tom = (await screen.findByRole('group', { name: 'sip:tom@sip.athenasip.org' })).closest('li')!;
    fireEvent.click(within(tom).getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog', { name: `Remove sip:tom@sip.athenasip.org from conf-sales?` });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await settle(SETTLE_MS + 50);
    expect(remove).toHaveBeenCalledWith(ROOM, 'c0nf1@192.168.1.24');
    expect(screen.queryByRole('group', { name: 'sip:tom@sip.athenasip.org' })).toBeNull();
    expect(screen.getByRole('group', { name: 'sip:tomweb@sip.athenasip.org' })).toBeTruthy();
  });

  it('follows the bus when it can, and polls when it cannot', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = new FakeAdminApi();
    const list = vi.spyOn(api, 'listConferences');
    // No view-cluster-status: no stream, so the screen reads on a timer.
    show(api, ['manage-cluster']);
    await screen.findByRole('region', { name: `Room ${ROOM}` });
    expect(api.eventListeners).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(ROOMS_POLL_MS); });
    expect(list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('drops someone who leaves as the bus says so', async () => {
    const api = new FakeAdminApi();
    show(api);
    await screen.findByRole('group', { name: 'sip:tomweb@sip.athenasip.org' });
    await settle();
    act(() => api.endCallElsewhere('c0nf2@203.0.113.40'));
    await settle(SETTLE_MS + 50);
    expect(screen.queryByRole('group', { name: 'sip:tomweb@sip.athenasip.org' })).toBeNull();
  });
});
