// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { FakeAdminApi } from '../api/FakeAdminApi';
import { ROLES } from '../api/types';
import { SecurityScreen, timeLeft } from './SecurityScreen';

describe('timeLeft', () => {
  it('counts minutes, then seconds in the last one', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(timeLeft('2026-10-26T12:13:00Z', now)).toBe('13m left');
    expect(timeLeft('2026-10-26T12:00:59Z', now)).toBe('59s left');
    expect(timeLeft('2026-10-26T11:59:00Z', now)).toBe('ending');
    expect(timeLeft('soon', now)).toBe('-');
  });
});

describe('SecurityScreen guessing', () => {
  it('lists the banned addresses and closed SIP addresses, soonest to end first', async () => {
    render(<SecurityScreen api={new FakeAdminApi()} roles={['view-cluster-status']} />);
    const first = await screen.findByRole('group', { name: '198.51.100.23' });
    expect(first.textContent).toContain('Banned by sip-0001');
    expect(screen.getByRole('group', { name: '2001:db8::5' })).toBeTruthy();
    expect(await screen.findByRole('group', { name: 'sip:reception@blackraven.co.nz' })).toBeTruthy();
    expect(screen.getAllByText('13m left').length).toBeGreaterThan(0);
  });

  it('offers no lifting without manage-cluster', async () => {
    render(<SecurityScreen api={new FakeAdminApi()} roles={['view-cluster-status']} />);
    await screen.findByRole('group', { name: '198.51.100.23' });
    expect(screen.queryByRole('button', { name: /Lift ban/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reopen/ })).toBeNull();
  });

  it('lifts a ban through a dialogue, on every node', async () => {
    const api = new FakeAdminApi();
    const lift = vi.spyOn(api, 'liftBan');
    render(<SecurityScreen api={api} roles={[...ROLES]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Lift ban 2001:db8::5' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Every node answers this address again');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lift ban' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: '2001:db8::5' })).toBeNull());
    expect(lift).toHaveBeenCalledWith('2001:db8::5');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await api.listBans()).map((ban) => ban.source)).toEqual(['198.51.100.23']);
  });

  it('takes a ban this node no longer held as lifted', async () => {
    const api = new FakeAdminApi();
    vi.spyOn(api, 'liftBan').mockRejectedValue(new ApiError('this node holds no ban on that address', 404, 'not_found'));
    render(<SecurityScreen api={api} roles={[...ROLES]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Lift ban 198.51.100.23' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Lift ban' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the dialogue open and says why when lifting fails', async () => {
    const api = new FakeAdminApi();
    vi.spyOn(api, 'liftBan').mockRejectedValue(new ApiError('you may not', 403, 'forbidden'));
    render(<SecurityScreen api={api} roles={[...ROLES]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Lift ban 198.51.100.23' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Lift ban' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeTruthy();
  });

  it('reopens a closed SIP address', async () => {
    const api = new FakeAdminApi();
    render(<SecurityScreen api={api} roles={[...ROLES]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen sip:reception@blackraven.co.nz' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reopen' }));
    expect(await screen.findByText('No SIP address is closed.')).toBeTruthy();
    expect(await api.listClosedAors()).toEqual([]);
  });
});

describe('FakeAdminApi guessing', () => {
  it('matches an address of record with its host in any case, and 404s what it does not hold', async () => {
    const api = new FakeAdminApi();
    await expect(api.liftBan('192.0.2.1')).rejects.toMatchObject({ status: 404, code: 'not_found' });
    await api.reopenAor('sip:reception@BlackRaven.co.nz');
    expect(await api.listClosedAors()).toEqual([]);
  });
});
