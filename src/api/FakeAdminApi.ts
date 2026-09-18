import type { AdminApi } from './AdminApi';
import { ApiError } from './errors';
import type {
  CreateRealm,
  CreateSubscriber,
  Realm,
  Registration,
  RtpRelaySettings,
  ServerStatus,
  Subscriber,
  UpdateSubscriber,
} from './types';

/**
 * An AthenaSIP server that only exists in this tab.
 *
 * It is not a mock. It holds the records, applies the writes and enforces the
 * rules the real server will enforce — a duplicate realm name is rejected, a
 * realm with subscribers cannot be deleted, a subscriber count follows its
 * realm — so a screen built against it is built against something that pushes
 * back. Mocks that answer yes to everything are how a form ships with no error
 * path at all.
 *
 * It is both the development target until the server grows `/api/v1`, and the
 * substrate every screen test runs on. One implementation for both, so a test
 * cannot pass against a fixture that the running application never sees.
 *
 * The seed data is the fixture list that used to be hardcoded inside the
 * Realms screen, which is exactly the kind of thing that should live behind
 * the API seam instead.
 */
export class FakeAdminApi implements AdminApi {
  private realms: Realm[];
  private subscribers: Subscriber[];
  /**
   * Held as a remaining lifetime rather than an absolute instant, and turned
   * into one at read time. Seeding absolute timestamps meant every binding had
   * expired a few minutes into a development session, so the screen that is
   * meant to show a healthy server showed nothing but red.
   */
  private registrations: Array<Omit<Registration, 'expires_unix_ms'> & { expires_in_ms: number }>;
  private relay: RtpRelaySettings;
  private nextId = 1;

  /**
   * `latencyMs` defaults to zero so tests are not slow and not flaky. The
   * running application passes a small delay, because a loading state that is
   * never seen in development is a loading state nobody notices is broken.
   */
  constructor(private readonly latencyMs = 0) {
    // Seed ids come from the same counter every later id comes from. Writing
    // them as literals is how `createRealm` handed out `realm-1` a second
    // time, and `findIndex` then deleted the wrong record — a bug that only
    // appears once something is created and then acted on.
    this.realms = [
      { id: this.id('realm'), name: 'sip.athenasip.org', description: 'The main AthenaSIP realm', subscriber_count: 2 },
      { id: this.id('realm'), name: 'blackraven.co.nz', description: 'A customer realm', subscriber_count: 1 },
    ];
    this.subscribers = [
      { id: this.id('sub'), realm: 'sip.athenasip.org', username: 'tom', display_name: 'Tom Cully', enabled: true },
      { id: this.id('sub'), realm: 'sip.athenasip.org', username: 'tomweb', display_name: 'Tom (WebRTC)', enabled: true },
      { id: this.id('sub'), realm: 'blackraven.co.nz', username: 'reception', display_name: 'Reception', enabled: false },
    ];
    this.registrations = [
      {
        id: this.id('reg'),
        aor: 'sip:tom@sip.athenasip.org',
        contact: 'sip:tom@192.168.1.24:5060;transport=tls',
        transport: 'tls',
        expires_in_ms: 240_000,
        node_id: 'sip-0001',
        user_agent: 'AthenaPhone/0.1',
      },
      {
        id: this.id('reg'),
        aor: 'sip:tomweb@sip.athenasip.org',
        contact: 'sip:tomweb@df7jal23ls0d.invalid;transport=ws',
        transport: 'ws',
        expires_in_ms: 45_000,
        node_id: 'sip-0001',
        user_agent: 'JsSIP 3.10.1',
      },
    ];
    this.relay = {
      enabled: true,
      public_address: '0.0.0.0',
      port_min: 22000,
      port_max: 23000,
      queue_until_both_connected: false,
    };
  }

  private async settle<T>(value: T, signal?: AbortSignal): Promise<T> {
    if (this.latencyMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, this.latencyMs);
        const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        if (signal?.aborted) { onAbort(); return; }
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    } else if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    // Structured-clone the way a real response would, so a screen that mutates
    // what it was handed cannot corrupt the store and pass anyway.
    return structuredClone(value);
  }

  private id(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  private realmByName(name: string): Realm {
    const realm = this.realms.find((candidate) => candidate.name === name);
    if (!realm) throw new ApiError(`No such realm: ${name}`, 404, 'realm_not_found');
    return realm;
  }

  private recount(realmName: string): void {
    const realm = this.realms.find((candidate) => candidate.name === realmName);
    if (realm) realm.subscriber_count = this.subscribers.filter((s) => s.realm === realmName).length;
  }

  status(signal?: AbortSignal): Promise<ServerStatus> {
    return this.settle<ServerStatus>({
      node_id: 'sip-0001',
      version: '0.2.0',
      uptime_seconds: 4523,
      transports: [
        { transport: 'udp', enabled: true, address: '0.0.0.0', port: 5060, listening: true },
        { transport: 'tcp', enabled: true, address: '0.0.0.0', port: 5060, listening: true },
        { transport: 'tls', enabled: false, address: '0.0.0.0', port: 5061, listening: false },
        { transport: 'ws', enabled: true, address: '0.0.0.0', port: 9500, listening: true },
      ],
      datastore_url: 'memory://',
      events_url: 'mqtt://127.0.0.1:1883',
      media_url: 'builtin://?public_address=0.0.0.0&port_min=22000&port_max=23000',
      registration_count: this.registrations.length,
      active_call_count: 0,
    }, signal);
  }

  listRealms(signal?: AbortSignal): Promise<Realm[]> {
    return this.settle(this.realms, signal);
  }

  async createRealm(realm: CreateRealm, signal?: AbortSignal): Promise<Realm> {
    const name = realm.name.trim();
    if (!name) throw new ApiError('A realm needs a name.', 400, 'realm_name_required');
    if (this.realms.some((candidate) => candidate.name === name)) {
      throw new ApiError(`${name} is already a realm on this server.`, 409, 'realm_exists');
    }
    const created: Realm = { id: this.id('realm'), name, description: realm.description.trim(), subscriber_count: 0 };
    this.realms.push(created);
    return this.settle(created, signal);
  }

  async updateRealm(id: string, changes: Partial<CreateRealm>, signal?: AbortSignal): Promise<Realm> {
    const realm = this.realms.find((candidate) => candidate.id === id);
    if (!realm) throw new ApiError('No such realm.', 404, 'realm_not_found');
    const name = changes.name?.trim();
    if (name && name !== realm.name) {
      if (this.realms.some((candidate) => candidate.name === name)) {
        throw new ApiError(`${name} is already a realm on this server.`, 409, 'realm_exists');
      }
      // Subscribers and registrations are keyed by realm name, so a rename has
      // to carry them or they are silently orphaned.
      for (const subscriber of this.subscribers) {
        if (subscriber.realm === realm.name) subscriber.realm = name;
      }
      realm.name = name;
    }
    if (changes.description !== undefined) realm.description = changes.description.trim();
    return this.settle(realm, signal);
  }

  async deleteRealm(id: string, signal?: AbortSignal): Promise<void> {
    const index = this.realms.findIndex((candidate) => candidate.id === id);
    if (index < 0) throw new ApiError('No such realm.', 404, 'realm_not_found');
    const realm = this.realms[index];
    if (this.subscribers.some((subscriber) => subscriber.realm === realm.name)) {
      throw new ApiError(`${realm.name} still has subscribers. Remove them first.`, 409, 'realm_not_empty');
    }
    this.realms.splice(index, 1);
    return this.settle(undefined, signal);
  }

  listSubscribers(realm: string, signal?: AbortSignal): Promise<Subscriber[]> {
    this.realmByName(realm);
    return this.settle(this.subscribers.filter((subscriber) => subscriber.realm === realm), signal);
  }

  async createSubscriber(realm: string, subscriber: CreateSubscriber, signal?: AbortSignal): Promise<Subscriber> {
    this.realmByName(realm);
    const username = subscriber.username.trim();
    if (!username) throw new ApiError('A subscriber needs a username.', 400, 'username_required');
    if (!subscriber.password) throw new ApiError('A subscriber needs a password.', 400, 'password_required');
    if (this.subscribers.some((candidate) => candidate.realm === realm && candidate.username === username)) {
      throw new ApiError(`${username}@${realm} already exists.`, 409, 'subscriber_exists');
    }
    const created: Subscriber = {
      id: this.id('sub'),
      realm,
      username,
      display_name: subscriber.display_name.trim(),
      enabled: subscriber.enabled,
    };
    this.subscribers.push(created);
    this.recount(realm);
    return this.settle(created, signal);
  }

  async updateSubscriber(realm: string, id: string, changes: UpdateSubscriber, signal?: AbortSignal): Promise<Subscriber> {
    const subscriber = this.subscribers.find((candidate) => candidate.id === id && candidate.realm === realm);
    if (!subscriber) throw new ApiError('No such subscriber.', 404, 'subscriber_not_found');
    if (changes.display_name !== undefined) subscriber.display_name = changes.display_name.trim();
    if (changes.enabled !== undefined) subscriber.enabled = changes.enabled;
    // A password is never stored here, and never read back. The real server
    // derives HA1 and keeps that; this only has to not pretend otherwise.
    return this.settle(subscriber, signal);
  }

  async deleteSubscriber(realm: string, id: string, signal?: AbortSignal): Promise<void> {
    const index = this.subscribers.findIndex((candidate) => candidate.id === id && candidate.realm === realm);
    if (index < 0) throw new ApiError('No such subscriber.', 404, 'subscriber_not_found');
    this.subscribers.splice(index, 1);
    this.recount(realm);
    return this.settle(undefined, signal);
  }

  listRegistrations(signal?: AbortSignal): Promise<Registration[]> {
    const now = Date.now();
    return this.settle(
      this.registrations.map(({ expires_in_ms, ...rest }) => ({ ...rest, expires_unix_ms: now + expires_in_ms })),
      signal,
    );
  }

  rtpRelaySettings(signal?: AbortSignal): Promise<RtpRelaySettings> {
    return this.settle(this.relay, signal);
  }

  async saveRtpRelaySettings(settings: RtpRelaySettings, signal?: AbortSignal): Promise<RtpRelaySettings> {
    if (settings.port_min > settings.port_max) {
      throw new ApiError('The port range starts after it ends.', 400, 'invalid_port_range');
    }
    if (settings.port_min < 1 || settings.port_max > 65535) {
      throw new ApiError('Ports run from 1 to 65535.', 400, 'invalid_port_range');
    }
    this.relay = { ...settings };
    return this.settle(this.relay, signal);
  }
}
