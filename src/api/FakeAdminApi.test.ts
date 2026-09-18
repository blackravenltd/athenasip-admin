import { describe, expect, it } from 'vitest';
import { FakeAdminApi } from './FakeAdminApi';
import { ApiError } from './errors';

describe('FakeAdminApi', () => {
  it('rejects a duplicate realm rather than silently creating two', async () => {
    const api = new FakeAdminApi();
    await expect(api.createRealm({ name: 'sip.athenasip.org', description: '' }))
      .rejects.toBeInstanceOf(ApiError);
  });

  it('refuses to delete a realm that still has subscribers', async () => {
    // The screens need a real conflict to render an error path against; a mock
    // that says yes to everything is how a delete ships with no error handling.
    const api = new FakeAdminApi();
    const [realm] = await api.listRealms();
    await expect(api.deleteRealm(realm.id)).rejects.toMatchObject({ status: 409 });
  });

  it('keeps the subscriber count in step with the subscribers', async () => {
    const api = new FakeAdminApi();
    await api.createSubscriber('blackraven.co.nz', {
      username: 'sales', display_name: 'Sales', password: 'hunter2', enabled: true,
    });
    const realms = await api.listRealms();
    expect(realms.find((realm) => realm.name === 'blackraven.co.nz')?.subscriber_count).toBe(2);
  });

  it('carries subscribers across a realm rename instead of orphaning them', async () => {
    const api = new FakeAdminApi();
    const [realm] = await api.listRealms();
    await api.updateRealm(realm.id, { name: 'sip.example.org' });
    await expect(api.listSubscribers('sip.example.org')).resolves.toHaveLength(2);
  });

  it('never hands back its own objects, so a screen cannot mutate the store', async () => {
    const api = new FakeAdminApi();
    const first = await api.listRealms();
    first[0].name = 'tampered';
    const second = await api.listRealms();
    expect(second[0].name).not.toBe('tampered');
  });

  it('rejects a port range that starts after it ends', async () => {
    const api = new FakeAdminApi();
    const settings = await api.rtpRelaySettings();
    await expect(api.saveRtpRelaySettings({ ...settings, port_min: 30000, port_max: 20000 }))
      .rejects.toMatchObject({ status: 400 });
  });
});
