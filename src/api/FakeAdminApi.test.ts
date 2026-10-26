import { describe, expect, it } from 'vitest';
import { FakeAdminApi } from './FakeAdminApi';
import { securedNode, signedInAs } from '../test/signedIn';

describe('FakeAdminApi', () => {
  it('rejects a duplicate realm as a conflict rather than creating two', async () => {
    const api = new FakeAdminApi();
    await expect(api.createRealm({ name: 'sip.athenasip.org' })).rejects.toMatchObject({ status: 409, code: 'conflict' });
  });

  it('gives a new realm the server defaults for what it was not given', async () => {
    const api = new FakeAdminApi();
    const realm = await api.createRealm({ name: 'sip.example.org', registration_minimum: 30 });
    expect(realm).toMatchObject({
      nonce_expiry: 300, registration_timeout: 5000, registration_minimum: 30,
      behaviour: { media_anchor: null, media_profile: null, dtmf: null, qualify_interval: null, rewrite_contact: null },
      behaviour_effective: { media_anchor: true, media_profile: 'mirror', dtmf: 'auto', qualify_interval: 0, rewrite_contact: false },
      behaviour_default: { media_anchor: true, media_profile: 'mirror', dtmf: 'auto', qualify_interval: 0, rewrite_contact: false },
    });
  });

  it('changes only the fields an update gives', async () => {
    const api = new FakeAdminApi();
    const before = (await api.listRealms()).find((realm) => realm.name === 'blackraven.co.nz')!;
    const after = await api.updateRealm('blackraven.co.nz', { behaviour: { media_anchor: false } });
    expect(after).toEqual({
      ...before,
      behaviour: { ...before.behaviour, media_anchor: false },
      behaviour_effective: { ...before.behaviour_effective, media_anchor: false },
    });
  });

  it('puts a setting back to the server’s on null, and leaves alone one it is not given', async () => {
    const api = new FakeAdminApi();
    const realm = await api.updateRealm('sip.athenasip.org', { behaviour: { media_profile: null } });
    expect(realm.behaviour).toEqual({ media_anchor: null, media_profile: null, dtmf: null, qualify_interval: 60, rewrite_contact: null });
    expect(realm.behaviour_effective.media_profile).toBe('mirror');
  });

  it('refuses an unknown setting or value, and the old top-level fields, changing nothing', async () => {
    const api = new FakeAdminApi();
    const before = (await api.listRealms()).find((realm) => realm.name === 'sip.athenasip.org');
    await expect(api.updateRealm('sip.athenasip.org', { nonce_expiry: 60, behaviour: { media_profile: 'nonsense' as never } }))
      .rejects.toMatchObject({ status: 400 });
    await expect(api.updateRealm('sip.athenasip.org', { behaviour: { volume: 11 } as never })).rejects.toMatchObject({ status: 400 });
    await expect(api.updateRealm('sip.athenasip.org', { media_anchor: false } as never))
      .rejects.toMatchObject({ status: 400, message: 'media_anchor has moved into the behaviour section' });
    expect((await api.listRealms()).find((realm) => realm.name === 'sip.athenasip.org')).toEqual(before);
  });

  it('lists ended calls newest first, an unanswered one with no answer time, and refuses a limit out of range', async () => {
    const api = new FakeAdminApi();
    const records = await api.listCallRecords();
    expect(records.map((record) => record.id)).toEqual(['r1@192.168.1.24', 'r2@203.0.113.40', 'r3@192.168.1.24']);
    expect(records[1]).toMatchObject({ duration: 0, answered_at: null });
    expect(Date.parse(records[0].ended_at!) - Date.parse(records[0].answered_at!)).toBe(184_000);
    await expect(api.listCallRecords(1)).resolves.toHaveLength(1);
    await expect(api.listCallRecords(0)).rejects.toMatchObject({ status: 400 });
  });

  it('deletes a realm with its subscribers and their registrations, as the server does', async () => {
    const api = new FakeAdminApi();
    await api.deleteRealm('blackraven.co.nz');
    await expect(api.listSubscribers('blackraven.co.nz')).rejects.toMatchObject({ status: 404 });
    await api.createRealm({ name: 'blackraven.co.nz' });
    await expect(api.listSubscribers('blackraven.co.nz')).resolves.toHaveLength(0);
    await expect(api.listRegistrations('blackraven.co.nz')).resolves.toHaveLength(0);
  });

  it('changes a subscriber’s media profile without a password, and refuses a realm-only setting, changing nothing', async () => {
    const api = new FakeAdminApi();
    await expect(api.updateSubscriber('sip.athenasip.org', 'tom', { behaviour: { media_profile: 'srtp' } }))
      .resolves.toMatchObject({ behaviour: { media_profile: 'srtp' } });
    await expect(api.updateSubscriber('sip.athenasip.org', 'tom', { password: 'p', behaviour: { media_anchor: false } as never }))
      .rejects.toMatchObject({ status: 400 });
    await expect(api.updateSubscriber('sip.athenasip.org', 'tom', { behaviour: { media_profile: 'nonsense' as never } }))
      .rejects.toMatchObject({ status: 400 });
    expect((await api.listSubscribers('sip.athenasip.org')).find((subscriber) => subscriber.user === 'tom')?.behaviour.media_profile).toBe('srtp');
  });

  it('takes rewrite_contact as true, false or null, and refuses anything else', async () => {
    const api = new FakeAdminApi();
    await expect(api.updateRealm('blackraven.co.nz', { behaviour: { rewrite_contact: 'yes' as never } })).rejects.toMatchObject({ status: 400 });
    await expect(api.updateRealm('blackraven.co.nz', { behaviour: { rewrite_contact: null } }))
      .resolves.toMatchObject({ behaviour: { rewrite_contact: null }, behaviour_effective: { rewrite_contact: false } });
  });

  it('refuses a probe interval outside the node’s bounds, and takes 0 for never', async () => {
    const api = new FakeAdminApi();
    await expect(api.updateRealm('blackraven.co.nz', { behaviour: { qualify_interval: 4 } })).rejects.toMatchObject({ status: 400 });
    await expect(api.updateRealm('blackraven.co.nz', { behaviour: { qualify_interval: 86401 } })).rejects.toMatchObject({ status: 400 });
    await expect(api.updateRealm('blackraven.co.nz', { behaviour: { qualify_interval: 0 } }))
      .resolves.toMatchObject({ behaviour_effective: { qualify_interval: 0 } });
  });

  it('probes the clients of a realm that probes, and none once it stops', async () => {
    const api = new FakeAdminApi();
    expect((await api.listQualifiedClients()).map((client) => client.subscriber)).toEqual(['sip:tom@sip.athenasip.org', 'sip:tomweb@sip.athenasip.org']);
    await api.updateRealm('sip.athenasip.org', { behaviour: { qualify_interval: 0 } });
    await expect(api.listQualifiedClients()).resolves.toEqual([]);
  });

  it('takes a subscriber’s registrations with it', async () => {
    const api = new FakeAdminApi();
    await api.deleteSubscriber('sip.athenasip.org', 'tom');
    const subscribers = (await api.listRegistrations()).map((binding) => binding.subscriber);
    expect(subscribers).not.toContain('sip:tom@sip.athenasip.org');
  });

  it('reports registration times in Unix seconds', async () => {
    const api = new FakeAdminApi();
    const [binding] = await api.listRegistrations();
    const now = Date.now() / 1000;
    expect(binding.expires_at).toBeGreaterThan(now);
    expect(binding.expires_at).toBeLessThan(now + 3600);
  });

  it('never hands back its own objects, so a screen cannot mutate the store', async () => {
    const api = new FakeAdminApi();
    const first = await api.listRealms();
    first[0].name = 'tampered';
    expect((await api.listRealms())[0].name).not.toBe('tampered');
  });

  describe('secured', () => {
    it('refuses a request with no session with 401, and tells the session', async () => {
      const { api, session } = securedNode();
      session.signIn('nonsense', { username: 'x', display_name: '', roles: [] });
      await expect(api.listRealms()).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
      expect(session.token).toBeUndefined();
    });

    it('gives one answer for a wrong password, an unknown name and a disabled user', async () => {
      const { api } = securedNode();
      for (const [username, password] of [['ops', 'wrong'], ['nobody', 'nobody'], ['former', 'former']]) {
        await expect(api.login(username, password)).rejects.toMatchObject({ status: 401, message: 'invalid username or password' });
      }
    });

    it('compares usernames without case', async () => {
      const { api } = securedNode();
      await expect(api.login('OPS', 'ops')).resolves.toMatchObject({ roles: ['view-cluster-status'] });
    });

    it('holds exactly the roles given: managing users does not let you read status', async () => {
      const { api } = await signedInAs('ops');
      await expect(api.nodes()).resolves.toHaveLength(2);
      await expect(api.listRealms()).rejects.toMatchObject({ status: 403, code: 'forbidden' });
      const managers = await signedInAs('helpdesk');
      await expect(managers.api.listRealms()).resolves.toHaveLength(2);
      await expect(managers.api.createRealm({ name: 'x.example.org' })).rejects.toMatchObject({ status: 403 });
      await expect(managers.api.nodes()).rejects.toMatchObject({ status: 403 });
    });

    it('re-reads roles on every request, so a role removed takes effect at once', async () => {
      const { api } = await signedInAs('ops');
      await expect(api.nodes()).resolves.toHaveLength(2);
      api.alterUserElsewhere('ops', { roles: [] });
      await expect(api.nodes()).rejects.toMatchObject({ status: 403 });
    });

    it('ends every session of a user who is disabled', async () => {
      const { api, session } = await signedInAs('ops');
      api.alterUserElsewhere('ops', { disabled: true });
      await expect(api.nodes()).rejects.toMatchObject({ status: 401 });
      expect(session.token).toBeUndefined();
    });

    it('knows no bearer but a session from a login', async () => {
      const { api } = securedNode();
      await expect(api.session('config-admin')).rejects.toMatchObject({ status: 401 });
    });

    it('leaves health open', async () => {
      await expect(securedNode().api.health()).resolves.toMatchObject({ status: 'ok' });
    });

    it('creates users with no roles by default, and refuses a taken name whatever its case', async () => {
      const { api } = await signedInAs('admin');
      await expect(api.createUser({ username: 'Tom', display_name: 'Tom', password: 'p', roles: [] })).resolves.toMatchObject({ roles: [], last_login_at: 0 });
      await expect(api.createUser({ username: 'tom', display_name: '', password: 'p', roles: [] })).rejects.toMatchObject({ status: 409 });
    });

    it('signs a user out everywhere whatever the case of the name, succeeds for one never signed in, and 404s for nobody', async () => {
      const { api } = await signedInAs('admin');
      const { token } = await api.login('ops', 'ops');
      await expect(api.revokeSessions('OPS')).resolves.toBeUndefined();
      await expect(api.session(token)).rejects.toMatchObject({ status: 401 });
      await expect(api.revokeSessions('helpdesk')).resolves.toBeUndefined();
      await expect(api.revokeSessions('nobody')).rejects.toMatchObject({ status: 404 });
    });

    it('will not let you disable, demote or delete yourself', async () => {
      const { api } = await signedInAs('admin');
      await expect(api.updateUser('admin', { disabled: true })).rejects.toMatchObject({ status: 409, code: 'would_lock_out' });
      await expect(api.updateUser('admin', { roles: ['manage-realms'] })).rejects.toMatchObject({ status: 409, code: 'would_lock_out' });
      await expect(api.deleteUser('admin')).rejects.toMatchObject({ status: 409, code: 'would_lock_out' });
      await expect(api.updateUser('ops', { disabled: true })).resolves.toMatchObject({ disabled: true });
    });

    it('lets you change your own password with the old one, and nobody else’s without the role', async () => {
      const { api } = await signedInAs('ops');
      await expect(api.changePassword('ops', { password: 'new', old_password: 'wrong' })).rejects.toMatchObject({ status: 403, code: 'wrong_password' });
      await expect(api.changePassword('helpdesk', { password: 'x' })).rejects.toMatchObject({ status: 403 });
      await expect(api.changePassword('ops', { password: 'new', old_password: 'ops' })).resolves.toBeUndefined();
      // The change ends every session the user holds, the one that asked included.
      await expect(api.session()).rejects.toMatchObject({ status: 401 });
      await expect(securedNode().api.login('ops', 'new')).rejects.toMatchObject({ status: 401 });
    });
  });
});

describe('FakeAdminApi conferencing, trunks and the bus', () => {
  it('groups the calls to a focus into a room, with the focus named once answered', async () => {
    const api = new FakeAdminApi();
    const [room] = await api.listConferences();
    expect(room).toMatchObject({ uri: 'sip:conf-sales@sip.athenasip.org', focus: 'rooms' });
    expect(room.participants.map((participant) => participant.identity)).toEqual(['sip:tom@sip.athenasip.org', 'sip:tomweb@sip.athenasip.org']);
    expect((await api.listCalls()).filter((call) => call.focus === room.uri)).toHaveLength(2);
  });

  it('removes a participant from a room only by its own Call-ID, and tells the bus', async () => {
    const api = new FakeAdminApi();
    const seen: string[] = [];
    const controller = new AbortController();
    void api.events((event) => seen.push(event.topic), controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(api.removeConferenceParticipant('sip:conf-other@sip.athenasip.org', 'c0nf1@192.168.1.24')).rejects.toMatchObject({ status: 404 });
    await api.removeConferenceParticipant('sip:conf-sales@sip.athenasip.org', 'c0nf1@192.168.1.24');
    expect((await api.getConference('sip:conf-sales@sip.athenasip.org')).participants).toHaveLength(1);
    expect(seen).toContain('calls/c0nf1@192.168.1.24/unregister');
    controller.abort();
    expect(api.eventListeners).toBe(0);
  });

  it('refuses to hang up a ringing call, which only its caller can cancel', async () => {
    const api = new FakeAdminApi();
    await expect(api.hangUpCall('3848276298220188511@203.0.113.40')).rejects.toMatchObject({ status: 409, code: 'not_answered' });
    await api.hangUpCall('a84b4c76e66710@192.168.1.24');
    expect((await api.listCalls()).map((call) => call.id)).not.toContain('a84b4c76e66710@192.168.1.24');
  });

  it('needs manage-cluster to end a call, and manage-trunks for trunks', async () => {
    const { api } = await signedInAs('ops');
    await expect(api.hangUpCall('a84b4c76e66710@192.168.1.24')).rejects.toMatchObject({ status: 403 });
    await expect(api.listTrunks()).rejects.toMatchObject({ status: 403 });
  });

  it('never gives a trunk password back, and says whether one is held', async () => {
    const api = new FakeAdminApi();
    const created = await api.createTrunk({ name: 'carrier2', uri: 'sip:sip.carrier2.example', password: 'secret' });
    expect(created).not.toHaveProperty('password');
    expect(created.password_set).toBe(true);
    await expect(api.createTrunk({ name: 'CARRIER2', uri: 'sip:x.example' })).rejects.toMatchObject({ status: 409 });
    await expect(api.updateTrunk('carrier2', { register: { expires: 30 } })).rejects.toMatchObject({ status: 400 });
  });

  it('gives a subscriber the rooms of each focus serving its realm', async () => {
    const api = new FakeAdminApi();
    const line = (realm: string, user: string) => ({ realm, user, password: 'x' });
    expect((await api.subscriberConfig(line('sip.athenasip.org', 'tom'))).realm?.conferences).toEqual([{ prefix: 'conf-', trunk: 'rooms' }]);
    expect((await api.subscriberConfig(line('blackraven.co.nz', 'reception'))).realm?.conferences).toEqual([]);
    await api.updateTrunk('rooms', { attributes: { focus: { prefix: '8' } } });
    expect((await api.subscriberConfig(line('blackraven.co.nz', 'reception'))).realm?.conferences).toEqual([{ prefix: '8', trunk: 'rooms' }]);
  });

  it('keeps dtmf and attributes on a subscriber, replacing attributes whole', async () => {
    const api = new FakeAdminApi();
    const saved = await api.updateSubscriber('blackraven.co.nz', 'reception', { behaviour: { dtmf: 'rfc4733' }, attributes: { floor: 2 } });
    expect(saved.behaviour).toEqual({ media_profile: null, dtmf: 'rfc4733' });
    expect(saved.attributes).toEqual({ floor: 2 });
    await expect(api.updateSubscriber('blackraven.co.nz', 'reception', { behaviour: { dtmf: 'morse' as never } })).rejects.toMatchObject({ status: 400 });
  });
});
