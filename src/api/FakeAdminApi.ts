import type { AdminApi } from './AdminApi';
import { ApiError } from './errors';
import type {
  Account,
  Call,
  AdminUser,
  ChangePassword,
  ClientConfig,
  ClusterNode,
  NodeTransport,
  CreateAdminUser,
  CreateAccount,
  CreateRealm,
  Health,
  AccountBehaviour,
  Behaviour,
  BehaviourEffective,
  Realm,
  LoginResult,
  MediaProfile,
  MediaEngine,
  MediaReoffer,
  QualifiedClient,
  Registration,
  Role,
  SessionInfo,
  UpdateAccount,
  UpdateAdminUser,
  UpdateRealm,
} from './types';
import { MEDIA_PROFILES, QUALIFY_MAX, QUALIFY_MIN, ROLES } from './types';

/**
 * The server's own `behaviour:` section, which a realm inherits a setting from
 * when it has none of its own. These are the shipped defaults.
 */
const SERVER_BEHAVIOUR: BehaviourEffective = { media_anchor: true, media_profile: 'mirror', qualify_interval: 0, rewrite_contact: false };

/** A realm as held: its own settings, with what they come to worked out at read time, as the node does. */
type StoredRealm = Omit<Realm, 'behaviour_effective' | 'behaviour_default'>;

export interface FakeAdminApiOptions {
  /** Milliseconds each answer takes. Zero in tests; the running app passes a little. */
  latencyMs?: number;
  /**
   * Check credentials and roles on every route, as the node will. Off, which
   * is what a screen test that is not about auth wants, every request is let
   * through as if it held every role.
   */
  secured?: boolean;
  /** The session's token, read per call as `HttpAdminApi` reads it. */
  token?: () => string | undefined;
  /** Called with every 401 and 403 on the session's own requests, as `HttpAdminApi` calls them. */
  onUnauthorized?: (error: ApiError) => void;
  onForbidden?: (error: ApiError) => void;
  /** Seconds a login lasts. */
  sessionSeconds?: number;
}

/** What the roles table in the server's `docs/authentication.md` says each group of routes needs. */
const STATUS: readonly Role[] = ['view-cluster-status'];
const REALMS: readonly Role[] = ['manage-realms'];
/** Listing and reading a realm: whoever places a subscriber has to find the realm first. */
const REALMS_READ: readonly Role[] = ['manage-realms', 'manage-realm-subscribers'];
const ACCOUNTS: readonly Role[] = ['manage-realm-subscribers'];
const USERS: readonly Role[] = ['manage-admin-users'];
/** Any authenticated caller. */
const ANYONE: readonly Role[] = [];

interface StoredUser extends AdminUser {
  /** Held as given, because this node exists only in a tab. The real one keeps PBKDF2. */
  password: string;
}

type Stored = Omit<Registration, 'registered_at' | 'expires_at'> & { age_s: number; expires_in_s: number };

/**
 * A live call, held as offsets from when this node was made and turned into
 * instants and counters at read time, so the counters move between polls the
 * way a relay's do. Each leg gives packets per second in each direction it
 * reports; a direction left out is one the engine does not report.
 */
interface StoredCall extends Omit<Call, 'created_at' | 'answered_at' | 'media'> {
  age_s: number;
  answered_age_s: number | null;
  media: { engine: string; legs: Array<{ in?: number; out?: number }> } | null;
}

/** RTP at 50 packets a second, 172 bytes each: G.711 in 20ms frames. */
const PACKET_BYTES = 172;

/**
 * An AthenaSIP node that only exists in this tab.
 *
 * It is not a mock. It holds the records, applies the writes and enforces the
 * rules the real node enforces, read from its handlers rather than guessed:
 * a duplicate realm or account is a `conflict`, an unknown one `not_found`, a
 * missing field `invalid_request`, a caller without the route's role
 * `forbidden`, and deleting a realm deletes its accounts and their
 * registrations, as the server's does. Its users, sessions and roles are the server's
 * `docs/authentication.md`, which the node does not enforce until it is built. Mocks that answer yes to everything are how a form
 * ships with no error path at all.
 */
export class FakeAdminApi implements AdminApi {
  private realms: StoredRealm[];
  private accounts: Account[];
  private registrations: Stored[];
  private calls: StoredCall[];
  private reoffers: Array<Omit<MediaReoffer, 'last_at'> & { age_s: number }> = [{
    subscriber: 'sip:reception@blackraven.co.nz', rejected: 'webrtc', took: 'rtp', count: 2, age_s: 420, suggested_media_profile: 'rtp',
  }];
  private readonly madeAt = Date.now();
  private users: StoredUser[];
  /** Session token to username and expiry. */
  private sessions = new Map<string, { username: string; expires_at: number }>();
  private readonly latencyMs: number;
  private readonly secured: boolean;
  private readonly token: () => string | undefined;
  private readonly onUnauthorized: (error: ApiError) => void;
  private readonly onForbidden: (error: ApiError) => void;
  private readonly sessionSeconds: number;
  private nextId = 1;
  private nextToken = 1;

  constructor(options: FakeAdminApiOptions = {}) {
    this.latencyMs = options.latencyMs ?? 0;
    this.secured = options.secured ?? false;
    this.token = options.token ?? (() => undefined);
    this.onUnauthorized = options.onUnauthorized ?? (() => undefined);
    this.onForbidden = options.onForbidden ?? (() => undefined);
    this.sessionSeconds = options.sessionSeconds ?? 8 * 3600;

    const now = Math.floor(Date.now() / 1000);
    const user = (username: string, display_name: string, roles: Role[], extra: Partial<StoredUser> = {}): StoredUser => ({
      username, display_name, roles, disabled: false, created_at: now - 86_400 * 30, last_login_at: now - 3600, password: username, ...extra,
    });
    // Each password is the username, which is fine for a node that only exists in a tab.
    this.users = [
      user('admin', 'Administrator', [...ROLES]),
      user('ops', 'Operations', ['view-cluster-status']),
      user('helpdesk', 'Help desk', ['manage-realm-subscribers']),
      user('newhire', 'New hire', [], { last_login_at: 0 }),
      user('former', 'Former employee', ['manage-realms'], { disabled: true }),
    ];

    this.realms = [
      this.realm('sip.athenasip.org', { media_anchor: null, media_profile: 'webrtc', qualify_interval: 60, rewrite_contact: null }),
      // Relaying set on the realm itself, the profile inherited.
      { ...this.realm('blackraven.co.nz', { media_anchor: true, media_profile: null, qualify_interval: null, rewrite_contact: true }), registration_minimum: 60 },
    ];
    this.accounts = [
      this.account('sip.athenasip.org', 'tom'),
      // AthenaPhone, whose media is WebRTC whatever transport it registers over.
      this.account('sip.athenasip.org', 'tomweb', 'webrtc'),
      this.account('blackraven.co.nz', 'reception'),
    ];
    // Held as offsets from now and turned into instants at read time, or every
    // binding would have expired a few minutes into a development session.
    this.registrations = [
      {
        subscriber: 'sip:tom@sip.athenasip.org',
        subscriber_id: this.accounts[0].id,
        contact: 'sip:tom@192.168.1.24:5061;transport=tls',
        age_s: 60,
        expires_in_s: 240,
        nat: true,
        node_id: '',
        flow_id: '',
        path: '',
      },
      {
        subscriber: 'sip:tomweb@sip.athenasip.org',
        subscriber_id: this.accounts[1].id,
        contact: 'sip:tomweb@df7jal23ls0d.invalid;transport=ws',
        age_s: 255,
        expires_in_s: 45,
        nat: false,
        node_id: '',
        flow_id: '',
        path: '',
      },
    ];
    // One answered call through the relay, with the browser's leg hearing
    // nothing back, which is what one-way audio looks like in the counters;
    // and one still ringing, which nothing anchors yet.
    this.calls = [
      {
        id: 'a84b4c76e66710@192.168.1.24',
        state: 'Connected',
        age_s: 95,
        answered_age_s: 88,
        participants: [
          { identity: 'sip:tom@sip.athenasip.org', originator: true, profile: 'plain-rtp' },
          { identity: 'sip:tomweb@sip.athenasip.org', originator: false, profile: 'webrtc' },
        ],
        media: { engine: 'builtin', legs: [{ in: 50, out: 50 }, { in: 50, out: 0 }] },
      },
      {
        id: '3848276298220188511@203.0.113.40',
        state: 'Ringing',
        age_s: 6,
        answered_age_s: null,
        participants: [
          { identity: 'sip:reception@blackraven.co.nz', originator: true, profile: 'plain-rtp' },
          { identity: 'sip:tom@sip.athenasip.org', originator: false, profile: null },
        ],
        media: null,
      },
    ];
  }

  private realm(name: string, behaviour: Required<Behaviour> = { media_anchor: null, media_profile: null, qualify_interval: null, rewrite_contact: null }): StoredRealm {
    return {
      name,
      id: this.nextId++,
      nonce_expiry: 3600,
      registration_timeout: 5000,
      registration_minimum: 0,
      behaviour,
    };
  }

  private present(realm: StoredRealm): Realm {
    return {
      ...realm,
      behaviour_effective: {
        media_anchor: realm.behaviour.media_anchor ?? SERVER_BEHAVIOUR.media_anchor,
        media_profile: realm.behaviour.media_profile ?? SERVER_BEHAVIOUR.media_profile,
        qualify_interval: realm.behaviour.qualify_interval ?? SERVER_BEHAVIOUR.qualify_interval,
        rewrite_contact: realm.behaviour.rewrite_contact ?? SERVER_BEHAVIOUR.rewrite_contact,
      },
      behaviour_default: { ...SERVER_BEHAVIOUR },
    };
  }

  private account(realm: string, user: string, media_profile: MediaProfile | null = null): Account {
    return { id: this.nextId++, uri: `sip:${user}@${realm}`, user, realm, behaviour: { media_profile } };
  }

  /** An account's behaviour, checked whole before any of it is kept, because the node's 400 changes nothing. */
  private accountBehaviour(behaviour: AccountBehaviour | undefined): AccountBehaviour {
    if (behaviour === undefined) return {};
    for (const key of Object.keys(behaviour)) {
      if (key !== 'media_profile') throw new ApiError(`${key} is not an account behaviour setting`, 400, 'invalid_request');
    }
    const profile = behaviour.media_profile;
    if (profile !== undefined && profile !== null && !MEDIA_PROFILES.includes(profile)) {
      throw new ApiError(`there is no media profile called ${String(profile)}`, 400, 'invalid_request');
    }
    return behaviour;
  }


  /** Runs a route: its role check, with the server's codes and wording, then the work. `undefined` is open. */
  private async settle<T>(roles: readonly Role[] | undefined, work: (caller: Caller) => T, signal?: AbortSignal): Promise<T> {
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
    const caller = roles === undefined ? OPEN : this.authorise(roles, this.token(), true);
    // Structured-clone the way a real response would, so a screen that mutates
    // what it was handed cannot corrupt the store and pass anyway.
    return structuredClone(work(caller));
  }

  /** Who a token is, with roles re-read from the user on every request, as the node does. */
  private caller(token: string | undefined): Caller | undefined {
    if (!this.secured) return EVERYTHING;
    if (!token) return undefined;
    const session = this.sessions.get(token);
    if (!session) return undefined;
    const user = this.users.find((candidate) => same(candidate.username, session.username));
    if (!user || user.disabled || session.expires_at <= Math.floor(Date.now() / 1000)) {
      this.sessions.delete(token);
      return undefined;
    }
    return { username: user.username, display_name: user.display_name, roles: [...user.roles], expires_at: session.expires_at };
  }

  /** Any of `accepted` admits; an empty list admits any authenticated caller. */
  private authorise(accepted: readonly Role[], token: string | undefined, own: boolean): Caller {
    const caller = this.caller(token);
    if (!caller) {
      const failure = new ApiError('a valid session is required', 401, 'unauthorized');
      if (own) this.onUnauthorized(failure);
      throw failure;
    }
    if (accepted.length > 0 && !accepted.some((role) => caller.roles.includes(role))) {
      const failure = new ApiError(`this needs the ${accepted.join(' or ')} role`, 403, 'forbidden');
      if (own) this.onForbidden(failure);
      throw failure;
    }
    return caller;
  }

  private find(name: string): StoredRealm {
    const realm = this.realms.find((candidate) => candidate.name === name);
    if (!realm) throw new ApiError(`no such realm: ${name}`, 404, 'not_found');
    return realm;
  }

  /** Checks the whole change before making any of it, because the node's 400 changes nothing. */
  private apply(realm: StoredRealm, changes: UpdateRealm): void {
    const whole = (value: unknown, field: string) => {
      if (value === undefined) return undefined;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new ApiError(`${field} must be a whole number of seconds`, 400, 'invalid_request');
      }
      return value;
    };
    for (const moved of ['media_anchor', 'media_profiles']) {
      if (moved in changes) throw new ApiError(`${moved} has moved into the behaviour section`, 400, 'invalid_request');
    }
    const nonce = whole(changes.nonce_expiry, 'nonce_expiry');
    const timeout = whole(changes.registration_timeout, 'registration_timeout');
    const minimum = whole(changes.registration_minimum, 'registration_minimum');
    const behaviour = changes.behaviour ?? {};
    for (const key of Object.keys(behaviour)) {
      if (!['media_anchor', 'media_profile', 'qualify_interval', 'rewrite_contact'].includes(key)) {
        throw new ApiError(`there is no behaviour setting called ${key}`, 400, 'invalid_request');
      }
    }
    const { media_anchor: anchor, media_profile: profile, qualify_interval: qualify, rewrite_contact: rewrite } = behaviour;
    if (rewrite !== undefined && rewrite !== null && typeof rewrite !== 'boolean') {
      throw new ApiError('rewrite_contact must be true, false or null', 400, 'invalid_request');
    }
    if (qualify !== undefined && qualify !== null
      && (!Number.isInteger(qualify) || (qualify !== 0 && (qualify < QUALIFY_MIN || qualify > QUALIFY_MAX)))) {
      throw new ApiError(`qualify_interval must be 0 or ${QUALIFY_MIN} to ${QUALIFY_MAX} seconds`, 400, 'invalid_request');
    }
    if (anchor !== undefined && anchor !== null && typeof anchor !== 'boolean') {
      throw new ApiError('media_anchor must be true, false or null', 400, 'invalid_request');
    }
    if (profile !== undefined && profile !== null && !MEDIA_PROFILES.includes(profile)) {
      throw new ApiError(`there is no media profile called ${String(profile)}`, 400, 'invalid_request');
    }

    realm.nonce_expiry = nonce ?? realm.nonce_expiry;
    realm.registration_timeout = timeout ?? realm.registration_timeout;
    realm.registration_minimum = minimum ?? realm.registration_minimum;
    // Left out is left alone; null is back to inheriting.
    if (anchor !== undefined) realm.behaviour.media_anchor = anchor;
    if (profile !== undefined) realm.behaviour.media_profile = profile;
    if (qualify !== undefined) realm.behaviour.qualify_interval = qualify;
    if (rewrite !== undefined) realm.behaviour.rewrite_contact = rewrite;
  }

  async login(username: string, password: string, signal?: AbortSignal): Promise<LoginResult> {
    return this.settle(undefined, () => {
      const user = this.users.find((candidate) => same(candidate.username, username));
      // One answer for a wrong name, a wrong password and a disabled user, so
      // the login cannot be used to find out which names exist.
      if (!user || user.disabled || user.password !== password) {
        throw new ApiError('invalid username or password', 401, 'unauthorized');
      }
      const now = Math.floor(Date.now() / 1000);
      const token = `fake-session-${this.nextToken++}`;
      const expires_at = now + this.sessionSeconds;
      this.sessions.set(token, { username: user.username, expires_at });
      user.last_login_at = now;
      return { token, expires_at, roles: [...user.roles] };
    }, signal);
  }

  async logout(signal?: AbortSignal): Promise<void> {
    return this.settle(ANYONE, () => {
      const token = this.token();
      if (token) this.sessions.delete(token);
      return undefined;
    }, signal);
  }

  async session(token?: string, signal?: AbortSignal): Promise<SessionInfo> {
    if (token === undefined) return this.settle(ANYONE, (caller) => ({ ...caller }), signal);
    return this.settle(undefined, () => ({ ...this.authorise(ANYONE, token, false) }), signal);
  }

  health(signal?: AbortSignal): Promise<Health> {
    return this.settle(undefined, () => ({ status: 'ok', node: 'sip-0001', version: '0.7.0', datastore: 'memory 0.0.1' }), signal);
  }

  /**
   * This node serves plain `ws` and no `wss`, so there is no `websocket_uri`,
   * as the real node answers. STUN only: the fake mints no TURN credential.
   */
  clientConfig(signal?: AbortSignal): Promise<ClientConfig> {
    return this.settle(STATUS, () => ({
      transports: FAKE_TRANSPORTS,
      ice_servers: [{ urls: 'stun:203.0.113.5:3478' }],
    }), signal);
  }

  nodes(signal?: AbortSignal): Promise<ClusterNode[]> {
    return this.settle(STATUS, () => [
      { id: 'sip-0001', self: true, status: 'ok', version: '0.7.0', transports: FAKE_TRANSPORTS },
      // A node that went quiet: still listed, so it can be told from one never heard of.
      {
        id: 'sip-0002', self: false, status: 'ok', stale: true, version: '0.7.0',
        at: new Date(Date.now() - 95_000).toISOString(), transports: FAKE_TRANSPORTS_2,
      },
    ], signal);
  }

  listRealms(signal?: AbortSignal): Promise<Realm[]> {
    return this.settle(REALMS_READ, () => this.realms.map((realm) => this.present(realm)), signal);
  }

  createRealm(realm: CreateRealm, signal?: AbortSignal): Promise<Realm> {
    return this.settle(REALMS, () => {
      const name = realm.name?.trim();
      if (!name) throw new ApiError('name is required', 400, 'invalid_request');
      if (this.realms.some((candidate) => candidate.name === name)) {
        throw new ApiError(`realm ${name} already exists`, 409, 'conflict');
      }
      const created = this.realm(name);
      this.apply(created, realm);
      this.realms.push(created);
      return this.present(created);
    }, signal);
  }

  updateRealm(name: string, changes: UpdateRealm, signal?: AbortSignal): Promise<Realm> {
    return this.settle(REALMS, () => {
      const realm = this.find(name);
      this.apply(realm, changes);
      return this.present(realm);
    }, signal);
  }

  deleteRealm(name: string, signal?: AbortSignal): Promise<void> {
    return this.settle(REALMS, () => {
      this.find(name);
      // Its accounts go with it, and their registrations with them.
      const gone = new Set(this.accounts.filter((account) => account.realm === name).map((account) => account.uri));
      this.realms = this.realms.filter((candidate) => candidate.name !== name);
      this.accounts = this.accounts.filter((account) => account.realm !== name);
      this.registrations = this.registrations.filter((binding) => !gone.has(binding.subscriber));
      return undefined;
    }, signal);
  }

  listAccounts(realm: string, signal?: AbortSignal): Promise<Account[]> {
    return this.settle(ACCOUNTS, () => {
      this.find(realm);
      return this.accounts.filter((account) => account.realm === realm);
    }, signal);
  }

  createAccount(realm: string, account: CreateAccount, signal?: AbortSignal): Promise<Account> {
    return this.settle(ACCOUNTS, () => {
      this.find(realm);
      const user = account.user?.trim();
      if (!user) throw new ApiError('user is required', 400, 'invalid_request');
      if (!account.password) throw new ApiError('password or ha1 is required', 400, 'invalid_request');
      const behaviour = this.accountBehaviour(account.behaviour);
      if (this.accounts.some((candidate) => candidate.realm === realm && candidate.user === user)) {
        throw new ApiError('that account already exists', 409, 'conflict');
      }
      const created = this.account(realm, user, behaviour.media_profile ?? null);
      this.accounts.push(created);
      return created;
    }, signal);
  }

  updateAccount(realm: string, user: string, changes: UpdateAccount, signal?: AbortSignal): Promise<Account> {
    return this.settle(ACCOUNTS, () => {
      this.find(realm);
      const account = this.accounts.find((candidate) => candidate.realm === realm && candidate.user === user);
      if (!account) throw new ApiError('no such account', 404, 'not_found');
      if (changes.password === undefined && changes.behaviour === undefined) {
        throw new ApiError('password, ha1 or behaviour is required', 400, 'invalid_request');
      }
      if (changes.password !== undefined && !changes.password) throw new ApiError('password must not be empty', 400, 'invalid_request');
      const behaviour = this.accountBehaviour(changes.behaviour);
      // The password is not kept here any more than it is on the server.
      if (behaviour.media_profile !== undefined) account.behaviour.media_profile = behaviour.media_profile;
      return account;
    }, signal);
  }

  deleteAccount(realm: string, user: string, signal?: AbortSignal): Promise<void> {
    return this.settle(ACCOUNTS, () => {
      this.find(realm);
      const account = this.accounts.find((candidate) => candidate.realm === realm && candidate.user === user);
      if (!account) throw new ApiError('no such account', 404, 'not_found');
      this.accounts = this.accounts.filter((candidate) => candidate !== account);
      // Its registrations go with it.
      this.registrations = this.registrations.filter((binding) => binding.subscriber !== account.uri);
      return undefined;
    }, signal);
  }

  listRegistrations(realm?: string, signal?: AbortSignal): Promise<Registration[]> {
    return this.settle(STATUS, () => {
      const now = Math.floor(Date.now() / 1000);
      return this.registrations
        .filter((binding) => !realm || binding.subscriber.endsWith(`@${realm}`))
        .map(({ age_s, expires_in_s, ...binding }) => ({
          ...binding,
          registered_at: now - age_s,
          expires_at: now + expires_in_s,
        }));
    }, signal);
  }

  private liveCall(call: StoredCall): Call {
    const now = Date.now();
    const since = (age_s: number) => (now - this.madeAt) / 1000 + age_s;
    const instant = (age_s: number | null) => (age_s === null ? null : new Date(now - age_s * 1000).toISOString());
    const counted = (rate: number | undefined, elapsed: number) => {
      if (rate === undefined) return {};
      const packets = Math.floor(rate * elapsed);
      return { packets, bytes: packets * PACKET_BYTES };
    };
    const { age_s, answered_age_s, media, ...rest } = call;
    return {
      ...rest,
      created_at: instant(age_s),
      answered_at: instant(answered_age_s),
      media: media && {
        engine: media.engine,
        idle_seconds: 0,
        legs: media.legs.map((leg) => {
          const elapsed = since(answered_age_s ?? 0);
          const inward = counted(leg.in, elapsed);
          const outward = counted(leg.out, elapsed);
          return {
            participant: null,
            ...('packets' in inward ? { packets_in: inward.packets, bytes_in: inward.bytes } : {}),
            ...('packets' in outward ? { packets_out: outward.packets, bytes_out: outward.bytes } : {}),
          };
        }),
      },
    };
  }

  listCalls(signal?: AbortSignal): Promise<Call[]> {
    return this.settle(STATUS, () => this.calls.map((call) => this.liveCall(call)), signal);
  }

  getCall(id: string, signal?: AbortSignal): Promise<Call> {
    return this.settle(STATUS, () => {
      const call = this.calls.find((candidate) => candidate.id === id);
      if (!call) throw new ApiError('no such call', 404, 'not_found');
      return this.liveCall(call);
    }, signal);
  }

  mediaEngine(signal?: AbortSignal): Promise<MediaEngine> {
    return this.settle(STATUS, () => ({ engine: 'builtin', connected: true, capabilities: ['bridge'] }), signal);
  }

  /** A desk phone that would not take WebRTC, offered plain RTP instead, twice. */
  listMediaReoffers(signal?: AbortSignal): Promise<MediaReoffer[]> {
    return this.settle(STATUS, () => this.reoffers.map(({ age_s, ...reoffer }) => ({
      ...reoffer,
      last_at: new Date(Date.now() - age_s * 1000).toISOString(),
    })), signal);
  }

  /** Every binding in a realm that probes, with what its last probes found. */
  listQualifiedClients(signal?: AbortSignal): Promise<QualifiedClient[]> {
    return this.settle(STATUS, () => this.registrations.flatMap((binding) => {
      const realm = this.realms.find((candidate) => binding.subscriber.endsWith(`@${candidate.name}`));
      const interval = realm && this.present(realm).behaviour_effective.qualify_interval;
      if (!interval) return [];
      const heard = QUALIFY_SEEN[binding.subscriber];
      return [{
        subscriber: binding.subscriber,
        contact: binding.contact,
        interval,
        answered_at: heard?.answered_age_s === undefined ? null : new Date(Date.now() - heard.answered_age_s * 1000).toISOString(),
        unanswered: heard?.unanswered ?? 0,
        said_media_profile: heard?.said ?? null,
      }];
    }), signal);
  }

  /** A call ending, as the node would see it. Not part of `AdminApi`. */
  endCallElsewhere(id: string): void {
    this.calls = this.calls.filter((call) => call.id !== id);
  }

  /**
   * Another administrator's change, made outside this session and with no
   * check: how a test takes a role away mid-session. Not part of `AdminApi`.
   */
  alterUserElsewhere(username: string, changes: UpdateAdminUser): void {
    const user = this.user(username);
    if (changes.roles) user.roles = validRoles(changes.roles);
    if (changes.disabled !== undefined) user.disabled = changes.disabled;
    if (user.disabled) this.revoke(username);
  }

  private user(username: string): StoredUser {
    const user = this.users.find((candidate) => same(candidate.username, username));
    if (!user) throw new ApiError(`no such user: ${username}`, 404, 'not_found');
    return user;
  }

  private revoke(username: string): void {
    for (const [token, session] of this.sessions) {
      if (same(session.username, username)) this.sessions.delete(token);
    }
  }

  listUsers(signal?: AbortSignal): Promise<AdminUser[]> {
    return this.settle(USERS, () => this.users.map(publicUser), signal);
  }

  createUser(user: CreateAdminUser, signal?: AbortSignal): Promise<AdminUser> {
    return this.settle(USERS, () => {
      const username = user.username?.trim();
      if (!username) throw new ApiError('username is required', 400, 'invalid_request');
      if (!user.password) throw new ApiError('password is required', 400, 'invalid_request');
      if (this.users.some((candidate) => same(candidate.username, username))) {
        throw new ApiError(`user ${username} already exists`, 409, 'conflict');
      }
      const created: StoredUser = {
        username,
        display_name: user.display_name?.trim() ?? '',
        roles: validRoles(user.roles ?? []),
        disabled: false,
        created_at: Math.floor(Date.now() / 1000),
        last_login_at: 0,
        password: user.password,
      };
      this.users.push(created);
      return publicUser(created);
    }, signal);
  }

  updateUser(username: string, changes: UpdateAdminUser, signal?: AbortSignal): Promise<AdminUser> {
    return this.settle(USERS, (caller) => {
      const user = this.user(username);
      // Nobody locks themselves out of the door they are standing in.
      if (same(caller.username, username)) {
        if (changes.disabled === true) throw new ApiError('a user cannot disable itself', 409, 'would_lock_out');
        if (changes.roles && !changes.roles.includes('manage-admin-users')) {
          throw new ApiError('a user cannot take manage-admin-users away from itself', 409, 'would_lock_out');
        }
      }
      if (changes.display_name !== undefined) user.display_name = changes.display_name.trim();
      if (changes.roles !== undefined) user.roles = validRoles(changes.roles);
      if (changes.disabled !== undefined) {
        user.disabled = changes.disabled;
        // Disabling is immediate: every session the user holds ends with it.
        if (user.disabled) this.revoke(username);
      }
      return publicUser(user);
    }, signal);
  }

  deleteUser(username: string, signal?: AbortSignal): Promise<void> {
    return this.settle(USERS, (caller) => {
      this.user(username);
      if (same(caller.username, username)) {
        throw new ApiError('a user cannot delete itself', 409, 'would_lock_out');
      }
      this.revoke(username);
      this.users = this.users.filter((candidate) => !same(candidate.username, username));
      return undefined;
    }, signal);
  }

  changePassword(username: string, change: ChangePassword, signal?: AbortSignal): Promise<void> {
    return this.settle(ANYONE, (caller) => {
      const user = this.user(username);
      const own = same(caller.username, username);
      const manager = caller.roles.includes('manage-admin-users');
      if (!own && !manager) {
        const failure = new ApiError('this needs the manage-admin-users role', 403, 'forbidden');
        this.onForbidden(failure);
        throw failure;
      }
      if (!change.password) throw new ApiError('password is required', 400, 'invalid_request');
      // Holding the role does not need the old one, because the case it exists for is somebody who has lost theirs.
      // 403 with its own code: the bearer is fine, a body field is wrong, and it is not the missing-role 403 either.
      if (own && !manager && change.old_password !== user.password) {
        throw new ApiError('the old password is not right', 403, 'wrong_password');
      }
      user.password = change.password;
      // Every session the user held, including the one that asked: the old password is no longer trusted.
      this.revoke(username);
      return undefined;
    }, signal);
  }

  revokeSessions(username: string, signal?: AbortSignal): Promise<void> {
    return this.settle(USERS, () => {
      this.user(username);
      this.revoke(username);
      return undefined;
    }, signal);
  }
}

type Caller = SessionInfo;

/** A route with no check runs as nobody in particular. */
const OPEN: Caller = { username: '', display_name: '', roles: [] };
/** What an unsecured node treats every request as. */
const EVERYTHING: Caller = { username: 'admin', display_name: 'Administrator', roles: [...ROLES] };

/** Usernames are compared case-insensitively and stored as given, as an email address is in practice. */
function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function publicUser({ password: _password, ...user }: StoredUser): AdminUser {
  return { ...user, roles: [...user.roles] };
}

/** What the probes of each seeded binding have found. */
const QUALIFY_SEEN: Record<string, { answered_age_s?: number; unanswered: number; said?: 'rtp' | 'webrtc' | 'srtp' }> = {
  'sip:tom@sip.athenasip.org': { answered_age_s: 12, unanswered: 0, said: 'rtp' },
  'sip:tomweb@sip.athenasip.org': { unanswered: 3 },
};

const FAKE_TRANSPORTS_2: NodeTransport[] = [
  { transport: 'udp', address: '203.0.113.6', port: 5060, uri: 'sip:203.0.113.6:5060;transport=udp' },
];

const FAKE_TRANSPORTS: NodeTransport[] = [
  { transport: 'udp', address: '203.0.113.5', port: 5060, uri: 'sip:203.0.113.5:5060;transport=udp' },
  { transport: 'tcp', address: '203.0.113.5', port: 5060, uri: 'sip:203.0.113.5:5060;transport=tcp' },
  { transport: 'tls', address: '203.0.113.5', port: 5061, uri: 'sips:203.0.113.5:5061;transport=tls' },
  { transport: 'ws', address: '203.0.113.5', port: 9500, uri: 'sip:203.0.113.5:9500;transport=ws' },
];

function validRoles(roles: readonly Role[]): Role[] {
  const unknown = roles.filter((role) => !ROLES.includes(role));
  if (unknown.length > 0) throw new ApiError(`there is no role called ${unknown[0]}`, 400, 'unknown_role');
  return ROLES.filter((role) => roles.includes(role));
}
