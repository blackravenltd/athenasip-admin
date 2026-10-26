// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { FakeAdminApi } from '../api/FakeAdminApi';
import { PresenceScreen, presenceProblem } from './PresenceScreen';

describe('presenceProblem', () => {
  it('tells presence switched off from a subscriber that does not exist', () => {
    expect(presenceProblem(new ApiError('off', 404, 'presence_off'))).toContain('Presence is off');
    expect(presenceProblem(new ApiError('nope', 404, 'not_found'))).toBe('There is no such subscriber.');
    expect(presenceProblem(new ApiError('boom', 500))).toBeUndefined();
  });
});

describe('PresenceScreen', () => {
  it('lists who watches whom, with the package in words', async () => {
    render(<PresenceScreen api={new FakeAdminApi()} roles={['view-cluster-status']} />);
    expect(await screen.findByRole('group', { name: 'sip:tom@sip.athenasip.org watches sip:conf-sales@sip.athenasip.org' })).toBeTruthy();
    expect(screen.getAllByText('Busy lamp (dialog)')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'One subscriber' })).toBeNull();
  });

  it('looks up one subscriber with Manage subscribers', async () => {
    const api = new FakeAdminApi();
    const lookup = vi.spyOn(api, 'subscriberPresence');
    render(<PresenceScreen api={api} roles={['view-cluster-status', 'manage-realm-subscribers']} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Subscriber' }), { target: { value: 'sip:tom@sip.athenasip.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText('Online')).toBeTruthy();
    expect(lookup).toHaveBeenCalledWith('sip.athenasip.org', 'tom');
  });

  it('says plainly when the node does not serve presence', async () => {
    const api = new FakeAdminApi();
    vi.spyOn(api, 'listPresenceSubscriptions').mockRejectedValue(new ApiError('off', 404, 'presence_off'));
    render(<PresenceScreen api={api} roles={['view-cluster-status']} />);
    expect(await screen.findByText('This node does not serve presence.')).toBeTruthy();
  });
});
