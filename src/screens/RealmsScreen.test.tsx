// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FakeAdminApi } from '../api/FakeAdminApi';
import { RealmsScreen } from './RealmsScreen';

function show(api = new FakeAdminApi()) {
  render(<MemoryRouter><RealmsScreen api={api} /></MemoryRouter>);
  return api;
}

/** The open dialogue. There is only ever one. */
function dialogue(): HTMLElement {
  return screen.getByRole('dialog');
}

describe('RealmsScreen', () => {
  it('lists what the server holds, not a fixture compiled into the page', async () => {
    show();
    expect(await screen.findByRole('group', { name: 'sip.athenasip.org' })).toBeTruthy();
    expect(await screen.findByRole('group', { name: 'blackraven.co.nz' })).toBeTruthy();
  });

  it('adds a realm and shows it without a reload', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a realm' }));
    fireEvent.change(within(dialogue()).getByLabelText('Domain'), { target: { value: 'sip.example.org' } });
    fireEvent.change(within(dialogue()).getByLabelText('Description'), { target: { value: 'A new one' } });
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Add realm' }));

    expect(await screen.findByRole('group', { name: 'sip.example.org' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('will not submit a realm with no name', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a realm' }));
    expect(within(dialogue()).getByRole('button', { name: 'Add realm' })).toHaveProperty('disabled', true);
  });

  it('shows the conflict when the name is taken, and keeps the dialogue open', async () => {
    // The error path is the one that gets shipped broken, because the happy
    // path is the only one anybody clicks through by hand.
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a realm' }));
    fireEvent.change(within(dialogue()).getByLabelText('Domain'), { target: { value: 'sip.athenasip.org' } });
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Add realm' }));

    expect(await within(dialogue()).findByRole('alert'))
      .toHaveProperty('textContent', 'sip.athenasip.org is already a realm on this server.');
    expect(screen.queryByRole('dialog')).not.toBeNull();
  });

  it('confirms before deleting, and reports a refusal rather than appearing to succeed', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete sip.athenasip.org' }));
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Delete realm' }));

    expect(await within(dialogue()).findByRole('alert'))
      .toHaveProperty('textContent', 'sip.athenasip.org still has subscribers. Remove them first.');
    // Still there, because the server said no.
    expect(await screen.findByRole('group', { name: 'sip.athenasip.org' })).toBeTruthy();
  });

  it('deletes an empty realm and drops it from the list', async () => {
    const api = new FakeAdminApi();
    await api.createRealm({ name: 'sip.empty.org', description: '' });
    show(api);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete sip.empty.org' }));
    fireEvent.click(within(dialogue()).getByRole('button', { name: 'Delete realm' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'sip.empty.org' })).toBeNull());
  });

  it('pages once there are more realms than fit, and not before', async () => {
    const api = new FakeAdminApi();
    for (let index = 0; index < 12; index++) {
      await api.createRealm({ name: `realm-${index}.example.org`, description: '' });
    }
    show(api);

    expect(await screen.findByText('Page 1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 2 of 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
  });

  it('says the list is empty rather than showing a bare panel', async () => {
    const api = new FakeAdminApi();
    for (const realm of await api.listRealms()) {
      for (const subscriber of await api.listSubscribers(realm.name)) {
        await api.deleteSubscriber(realm.name, subscriber.id);
      }
      await api.deleteRealm(realm.id);
    }
    show(api);
    expect(await screen.findByText(/No realms yet/)).toBeTruthy();
  });
});
