// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '../api/AdminApi';
import { FakeAdminApi } from '../api/FakeAdminApi';
import { signedInAs } from '../test/signedIn';
import { TrunksScreen } from './TrunksScreen';

function show(api: AdminApi = new FakeAdminApi()) {
  render(<TrunksScreen api={api} roles={['manage-trunks']} />);
  return api;
}

function dialogue(): HTMLElement {
  return screen.getByRole('dialog');
}

/** The row around a trunk's group, where its tags and actions are. */
function row(name: string): HTMLElement {
  return screen.getByRole('group', { name }).parentElement!;
}

describe('TrunksScreen', () => {
  it('lists the trunks with their registration and which is a conference focus', async () => {
    show();
    const acme = await screen.findByRole('group', { name: 'acme' });
    expect(acme.textContent).toContain('sip:sip.acme.example;transport=tls');
    expect(acme.textContent).toContain('198.51.100.0/24');
    expect(acme.textContent).toContain('Password held');
    expect(acme.textContent).toContain('200 OK, reported by sip-0001 10m ago');
    expect(within(row('acme')).getByText('Registered').className).toContain('state-tag-ok');
    expect(within(row('acme')).queryByText('Conference focus')).toBeNull();

    const rooms = screen.getByRole('group', { name: 'rooms' });
    expect(rooms.textContent).toContain('Rooms: conf-... in sip.athenasip.org, profile default');
    expect(rooms.textContent).toContain('No password');
    expect(within(row('rooms')).getByText('Conference focus')).toBeTruthy();
    expect(within(row('rooms')).getByText('Does not register').className).not.toContain('state-tag');
  });

  it('follows the event stream for a user who may read it', async () => {
    const { api, session } = await signedInAs('admin');
    render(<TrunksScreen api={api} roles={session.roles} />);
    await screen.findByRole('group', { name: 'acme' });
    await api.createTrunk({ name: 'late', uri: 'sip:late.example' });
    expect(await screen.findByRole('group', { name: 'late' }, { timeout: 3000 })).toBeTruthy();
  });

  it('adds a focus, keeping the other attributes typed as JSON', async () => {
    const api = show();
    const create = vi.spyOn(api, 'createTrunk');
    fireEvent.click(await screen.findByRole('button', { name: 'Add a trunk' }));
    fireEvent.change(within(dialogue()).getByLabelText('Name'), { target: { value: 'sfu' } });
    fireEvent.change(within(dialogue()).getByLabelText('URI'), { target: { value: 'sip:sfu.internal:5080' } });
    fireEvent.change(within(dialogue()).getByLabelText('Inbound addresses'), { target: { value: '10.0.0.6/32, 10.0.0.7/32' } });
    fireEvent.click(within(dialogue()).getByLabelText('This trunk is a conference focus'));
    fireEvent.change(within(dialogue()).getByLabelText('Room prefix'), { target: { value: '8' } });
    fireEvent.change(within(dialogue()).getByLabelText('Realms'), { target: { value: 'sip.athenasip.org, blackraven.co.nz' } });
    fireEvent.change(within(dialogue()).getByLabelText('Key presses'), { target: { value: 'rfc4733' } });
    fireEvent.change(within(dialogue()).getByLabelText('Attributes'), { target: { value: '{"priority": 5}' } });
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Add trunk' }));

    expect(await screen.findByRole('group', { name: 'sfu' })).toBeTruthy();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'sfu',
      inbound_addresses: ['10.0.0.6/32', '10.0.0.7/32'],
      attributes: { priority: 5, focus: { prefix: '8', realms: ['sip.athenasip.org', 'blackraven.co.nz'] }, dtmf: 'rfc4733' },
    }));
    expect('password' in create.mock.calls[0][0]).toBe(false);
    expect(screen.getByRole('group', { name: 'sfu' }).textContent).toContain('Rooms: 8... in sip.athenasip.org, blackraven.co.nz');
  });

  it('refuses a focus also typed into the JSON rather than choosing one', async () => {
    const api = show();
    const create = vi.spyOn(api, 'createTrunk');
    fireEvent.click(await screen.findByRole('button', { name: 'Add a trunk' }));
    fireEvent.change(within(dialogue()).getByLabelText('Name'), { target: { value: 'sfu' } });
    fireEvent.change(within(dialogue()).getByLabelText('URI'), { target: { value: 'sip:sfu.internal' } });
    fireEvent.click(within(dialogue()).getByLabelText('This trunk is a conference focus'));
    fireEvent.change(within(dialogue()).getByLabelText('Room prefix'), { target: { value: 'conf-' } });
    fireEvent.change(within(dialogue()).getByLabelText('Attributes'), { target: { value: '{"focus": {"prefix": "x-"}}' } });
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Add trunk' }));
    expect((await within(dialogue()).findByRole('alert')).textContent).toContain('has a focus of its own');
    expect(create).not.toHaveBeenCalled();
  });

  it('shows a taken name beside the name field', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a trunk' }));
    fireEvent.change(within(dialogue()).getByLabelText('Name'), { target: { value: 'ACME' } });
    fireEvent.change(within(dialogue()).getByLabelText('URI'), { target: { value: 'sip:other.example' } });
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Add trunk' }));
    const alert = await within(dialogue()).findByRole('alert');
    expect(alert.textContent).toBe('There is already a trunk called ACME. Names ignore case.');
    expect(within(dialogue()).getByLabelText(/^Name/).getAttribute('aria-invalid')).toBe('true');
  });

  it('changes a trunk without sending a password nobody typed, and with its attributes whole', async () => {
    const api = show();
    const update = vi.spyOn(api, 'updateTrunk');
    fireEvent.click(await screen.findByRole('button', { name: 'Change acme' }));
    expect(within(dialogue()).queryByLabelText('Name')).toBeNull();
    expect(within(dialogue()).getByLabelText('Key presses')).toHaveProperty('value', 'rfc4733');
    expect(within(dialogue()).getByLabelText('Password').getAttribute('placeholder')).toBe('Leave empty to keep the current one');
    fireEvent.change(within(dialogue()).getByLabelText('Outbound proxy'), { target: { value: 'sip:203.0.113.10:5060' } });
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Save trunk' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(update).toHaveBeenCalledTimes(1);
    const [name, changes] = update.mock.calls[0];
    expect(name).toBe('acme');
    expect('password' in changes).toBe(false);
    expect(changes).toMatchObject({ proxy: 'sip:203.0.113.10:5060', attributes: { prefixes: ['0'], dtmf: 'rfc4733' } });
    expect((await api.listTrunks())[0].password_set).toBe(true);
    expect(await screen.findByText('sip:203.0.113.10:5060')).toBeTruthy();
  });

  it('sends a password typed on a change', async () => {
    const api = show();
    const update = vi.spyOn(api, 'updateTrunk');
    fireEvent.click(await screen.findByRole('button', { name: 'Change rooms' }));
    fireEvent.change(within(dialogue()).getByLabelText('Password'), { target: { value: 's3cret' } });
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Save trunk' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('rooms', expect.objectContaining({ password: 's3cret' })));
  });

  it('asks before removing a trunk, and saying what stops', async () => {
    const api = show();
    const remove = vi.spyOn(api, 'deleteTrunk');
    fireEvent.click(await screen.findByRole('button', { name: 'Remove rooms' }));
    expect(dialogue().textContent).toContain('calls routed by it stop');
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('group', { name: 'rooms' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove rooms' }));
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Remove trunk' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'rooms' })).toBeNull());
    expect(remove).toHaveBeenCalledWith('rooms');
  });

  it('removes a password only when asked', async () => {
    const api = show();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove the password of acme' }));
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Remove password' }));
    await waitFor(() => expect(screen.getByRole('group', { name: 'acme' }).textContent).toContain('No password'));
    expect((await api.listTrunks())[0].password_set).toBe(false);
  });

  it('says so when there are no trunks', async () => {
    const api = new FakeAdminApi();
    await api.deleteTrunk('acme');
    await api.deleteTrunk('rooms');
    show(api);
    expect(await screen.findByText(/There are no trunks/)).toBeTruthy();
  });
});
