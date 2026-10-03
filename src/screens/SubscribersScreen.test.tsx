// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FakeAdminApi } from '../api/FakeAdminApi';
import { realmSubscribers, routes } from '../app/routes';
import { SubscribersScreen } from './SubscribersScreen';

function show(at: string, api = new FakeAdminApi()) {
  render(<MemoryRouter initialEntries={[at]}><SubscribersScreen api={api} /></MemoryRouter>);
  return api;
}

function dialogue(): HTMLElement {
  return screen.getByRole('dialog');
}

describe('SubscribersScreen', () => {
  it('asks for a realm rather than guessing one', async () => {
    show(routes.subscribers);
    expect(await screen.findByText('Choose a realm to see its subscribers.')).toBeTruthy();
  });

  it('lists a realm’s accounts by user, with the address each one registers as', async () => {
    show(realmSubscribers('sip.athenasip.org'));
    const row = await screen.findByRole('group', { name: 'tomweb' });
    expect(row.textContent).toContain('sip:tomweb@sip.athenasip.org');
    expect(screen.queryByRole('group', { name: 'reception' })).toBeNull();
  });

  it('adds a subscriber', async () => {
    show(realmSubscribers('blackraven.co.nz'));
    fireEvent.click(await screen.findByRole('button', { name: 'Add a subscriber' }));
    fireEvent.change(within(dialogue()).getByLabelText('User'), { target: { value: 'sales' } });
    fireEvent.change(within(dialogue()).getByLabelText('Password'), { target: { value: 'hunter2' } });
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Add subscriber' }));
    expect(await screen.findByRole('group', { name: 'sales' })).toBeTruthy();
  });

  it('shows a taken user against the user field', async () => {
    show(realmSubscribers('blackraven.co.nz'));
    fireEvent.click(await screen.findByRole('button', { name: 'Add a subscriber' }));
    fireEvent.change(within(dialogue()).getByLabelText('User'), { target: { value: 'reception' } });
    fireEvent.change(within(dialogue()).getByLabelText('Password'), { target: { value: 'x' } });
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Add subscriber' }));
    expect(await within(dialogue()).findByRole('alert')).toHaveProperty('textContent', 'reception@blackraven.co.nz already exists.');
  });

  it('sets a password and deletes a subscriber', async () => {
    show(realmSubscribers('sip.athenasip.org'));
    fireEvent.click(await screen.findByRole('button', { name: 'Set password for tom' }));
    fireEvent.change(within(dialogue()).getByLabelText('New password'), { target: { value: 'new' } });
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Delete tom' }));
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Delete subscriber' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'tom' })).toBeNull());
  });

  it('shows a subscriber’s own media profile, and none for one that takes its realm’s', async () => {
    show(realmSubscribers('sip.athenasip.org'));
    const tomweb = await screen.findByRole('group', { name: 'tomweb' });
    expect(tomweb.parentElement!.querySelector('.record-tag')?.textContent).toBe('WebRTC');
    expect(screen.getByRole('group', { name: 'tom' }).parentElement!.querySelector('.record-tag')).toBeNull();
  });

  it('sets a subscriber’s media profile, naming the realm’s as the default, and puts it back', async () => {
    const api = show(realmSubscribers('blackraven.co.nz'));
    fireEvent.click(await screen.findByRole('button', { name: 'Media for reception' }));
    const select = within(dialogue()).getByLabelText('Media profile');
    // blackraven.co.nz inherits the server's profile, which is mirror.
    expect(within(select).getByRole('option', { name: 'Realm default (mirror the caller)' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'webrtc' } });
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Save media profile' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await api.listAccounts('blackraven.co.nz'))[0].behaviour.media_profile).toBe('webrtc');

    fireEvent.click(await screen.findByRole('button', { name: 'Media for reception' }));
    expect(within(dialogue()).getByLabelText('Media profile')).toHaveProperty('value', 'webrtc');
    fireEvent.change(within(dialogue()).getByLabelText('Media profile'), { target: { value: '' } });
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Save media profile' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await api.listAccounts('blackraven.co.nz'))[0].behaviour.media_profile).toBeNull();
  });

  it('says a realm that does not exist does not exist', async () => {
    show(realmSubscribers('nowhere.example.org'));
    expect(await screen.findByText('no such realm: nowhere.example.org')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add a subscriber' })).toBeNull();
  });
});
