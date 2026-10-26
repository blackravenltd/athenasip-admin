import type { AdminApi } from './AdminApi';
import { ApiError } from './errors';
import type {
  Attributes,
  BusEvent,
  Subscriber,
  Call,
  CallRecord,
  Ban,
  ClosedAor,
  Conference,
  FocusAttribute,
  Presence,
  PresenceSubscription,
  PolicyReload,
  Trunk,
  TrunkWrite,
  AdminUser,
  ChangePassword,
  ClientConfig,
  ClusterNode,
  NodeTransport,
  CreateAdminUser,
  CreateSubscriber,
  CreateRealm,
  Health,
  SubscriberBehaviour,
  BehaviourEffective,
  RealmBehaviour,
  Realm,
  LoginResult,
  MediaProfile,
  MediaEngine,
  MediaReoffer,
  QualifiedClient,
  Registration,
  Role,
  SessionInfo,
  SubscriberLine,
  UpdateSubscriber,
  UpdateAdminUser,
  UpdateRealm,
} from './types';
import { isRealmName, isSipUser } from '../realms/names';
import { DTMF_MODES, MEDIA_PROFILES, QUALIFY_MAX, QUALIFY_MIN, ROLES, TRUNK_EXPIRES_MAX, TRUNK_EXPIRES_MIN } from './types';

/** The server's shipped `behaviour:` defaults, which a realm inherits where it sets nothing. */
const SERVER_BEHAVIOUR: BehaviourEffective = { media_anchor: true, media_profile: 'mirror', dtmf: 'auto', qualify_interval: 0, rewrite_contact: false };

/** The scripts the fake node runs, as `GET /nodes` and `POST /policy/reload` report them. */
const POLICY: PolicyReload = { driver: 'lua 1.0.0', fingerprint: '9f2c4e1ab07d53c8e6f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7' };

/** A realm as held: its own settings; the effective ones are worked out at read time, as on the node. */
type StoredRealm = Omit<Realm, 'behaviour_effective' | 'behaviour_default'>;

export interface FakeAdminApiOptions {
  /** Milliseconds each answer takes. Zero in tests. */
  latencyMs?: number;
  /**
   * Check credentials and roles on every route, as the node does. When off,
   * every request passes as if it held every role.
   */
  secured?: boolean;
  /** The session's token, read per call as `HttpAdminApi` reads it. */
  token?: () => string | undefined;
  /** Called with every 401 and 403 on the session's own requests, as in `HttpAdminApi`. */
  onUnauthorized?: (error: ApiError) => void;
  onForbidden?: (error: ApiError) => void;
  /** Seconds a login lasts. */
  sessionSeconds?: number;
}

/** The roles each group of routes needs, from the table in the server's `docs/authentication.md`. */
const STATUS: readonly Role[] = ['view-cluster-status'];
const REALMS: readonly Role[] = ['manage-realms'];
/** Listing and reading a realm: managing subscribers needs the realm list too. */
const REALMS_READ: readonly Role[] = ['manage-realms', 'manage-realm-subscribers'];
const SUBSCRIBERS: readonly Role[] = ['manage-realm-subscribers'];
const USERS: readonly Role[] = ['manage-admin-users'];
const CLUSTER: readonly Role[] = ['manage-cluster'];
const TRUNKS: readonly Role[] = ['manage-trunks'];
/** Any authenticated caller. */
const ANYONE: readonly Role[] = [];

interface StoredUser extends AdminUser {
  /** Held in the clear. The real node keeps PBKDF2. */
  password: string;
}

type Stored = Omit<Registration, 'registered_at' | 'expires_at'> & { age_s: number; expires_in_s: number };

/**
 * A live call, held as offsets from when this node was made and turned into
 * instants and counters at read time, so the counters move between polls.
 * Each leg gives packets per second in each direction it reports; a direction
 * left out is one the engine does not report.
 */
interface StoredCall extends Omit<Call, 'created_at' | 'answered_at' | 'media'> {
  age_s: number;
  answered_age_s: number | null;
  media: { engine: string; legs: Array<{ in?: number; out?: number }> } | null;
}

/** RTP at 50 packets a second, 172 bytes each: G.711 in 20ms frames. */
const PACKET_BYTES = 172;

/**
 * An in-memory AthenaSIP node. It holds the records, applies the writes and
 * enforces the real node's rules: a duplicate realm or subscriber is a
 * `conflict`, an unknown one `not_found`, a missing field `invalid_request`,
 * a caller without the route's role `forbidden`, and deleting a realm deletes
 * its subscribers and their registrations. Users, sessions and roles follow
 * the server's `docs/authentication.md`.
 */
export class FakeAdminApi implements AdminApi {
  private realms: StoredRealm[];
  private subscribers: Subscriber[];
  private registrations: Stored[];
  private calls: StoredCall[];
  private records: StoredRecord[] = RECORDS;
  private trunks: Trunk[];
  private policy: PolicyReload = { ...POLICY };
  /** Bans and closures, each ending at an instant in milliseconds. */
  private bans: Array<Omit<Ban, 'seconds_left' | 'until'> & { ends: number }>;
  private closed: Array<Omit<ClosedAor, 'seconds_left' | 'until'> & { ends: number }>;
  /** Who is listening on `events`, each with the topics it hears. */
  private listeners = new Set<(event: BusEvent) => void>();
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
    // Each password is the username.
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
    this.subscribers = [
      this.subscriber('sip.athenasip.org', 'tom'),
      // AthenaPhone, whose media is WebRTC whatever transport it registers over.
      this.subscriber('sip.athenasip.org', 'tomweb', 'webrtc'),
      this.subscriber('blackraven.co.nz', 'reception'),
    ];
    // A desk phone that sends its key presses as SIP INFO, and a script's routing hint.
    this.subscribers[2].behaviour.dtmf = 'info';
    this.subscribers[2].attributes = { group: 'front-desk' };
    this.realms[1].attributes = { default_room: 'conf-sales' };
    // Somebody guessing at the realms' passwords, banned on both nodes; and the line they were after.
    const at = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
    this.bans = [
      { source: '198.51.100.23', node: 'sip-0001', since: at(-120), ends: Date.now() + 780_000 },
      { source: '2001:db8::5', node: 'sip-0002', since: at(-40), ends: Date.now() + 860_000 },
    ];
    this.closed = [{ aor: 'sip:reception@blackraven.co.nz', node: 'sip-0001', since: at(-90), ends: Date.now() + 810_000 }];
    // A carrier that registers, and a FreeSWITCH conference focus for the first realm's rooms.
    this.trunks = [
      {
        name: 'acme',
        uri: 'sip:sip.acme.example;transport=tls',
        username: 'athena',
        password_set: true,
        register: { enabled: true, expires: 3600, contact_user: 'athena' },
        inbound_addresses: ['198.51.100.0/24'],
        tls_ca: '',
        attributes: { prefixes: ['0'], dtmf: 'rfc4733' },
        created_at: now - 86_400 * 12,
        registration: {
          node: 'sip-0001', state: 'registered', detail: '200 OK',
          expires_at: now + 3000, at: new Date(Date.now() - 600_000).toISOString(),
        },
      },
      {
        name: 'rooms',
        uri: 'sip:freeswitch.internal:5080;transport=tcp',
        password_set: false,
        register: { enabled: false },
        inbound_addresses: ['10.0.0.5/32'],
        tls_ca: '',
        attributes: { focus: { prefix: 'conf-', realms: ['sip.athenasip.org'], profile: 'default' } },
        created_at: now - 86_400 * 2,
        registration: null,
      },
    ];
    // Held as offsets and turned into instants at read time, so no binding
    // expires during a development session.
    this.registrations = [
      {
        subscriber: 'sip:tom@sip.athenasip.org',
        subscriber_id: this.subscribers[0].id,
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
        subscriber_id: this.subscribers[1].id,
        contact: 'sip:tomweb@df7jal23ls0d.invalid;transport=ws',
        age_s: 255,
        expires_in_s: 45,
        nat: false,
        node_id: '',
        flow_id: '',
        path: '',
      },
    ];
    // One answered call through the relay whose browser leg receives nothing,
    // as one-way audio shows in the counters; and one still ringing, unanchored.
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
      // Two people in a room, through the focus trunk; the second joined a minute later.
      {
        id: 'c0nf1@192.168.1.24',
        focus: 'sip:conf-sales@sip.athenasip.org',
        state: 'Connected',
        age_s: 240,
        answered_age_s: 239,
        participants: [
          { identity: 'sip:tom@sip.athenasip.org', originator: true, profile: 'plain-rtp', trunk: null },
          { identity: 'sip:conf-sales@sip.athenasip.org', originator: false, profile: 'plain-rtp', trunk: 'rooms' },
        ],
        media: { engine: 'builtin', legs: [{ in: 50, out: 50 }, { in: 50, out: 50 }] },
      },
      {
        id: 'c0nf2@203.0.113.40',
        focus: 'sip:conf-sales@sip.athenasip.org',
        state: 'Connected',
        age_s: 180,
        answered_age_s: 179,
        participants: [
          { identity: 'sip:tomweb@sip.athenasip.org', originator: true, profile: 'webrtc', trunk: null },
          { identity: 'sip:conf-sales@sip.athenasip.org', originator: false, profile: 'plain-rtp', trunk: 'rooms' },
        ],
        media: { engine: 'builtin', legs: [{ in: 50, out: 50 }, { in: 50, out: 50 }] },
      },
    ];
  }

  /** Tells every listener on `events`, as the node publishes on its bus. */
  private publish(topic: string, data: unknown): void {
    for (const listener of [...this.listeners]) listener({ topic, data });
  }

  /** A trunk by name, without regard to case, as on the node. */
  private trunk(name: string): Trunk {
    const trunk = this.trunks.find((candidate) => same(candidate.name, name));
    if (!trunk) throw new ApiError(`no such trunk: ${name}`, 404, 'not_found');
    return trunk;
  }

  /** The rooms each realm may dial, from the trunks whose `focus` attribute names it or names no realm. */
  private conferencePrefixes(realm: string): Array<{ prefix: string; trunk: string }> {
    return this.trunks.flatMap((trunk) => {
      const focus = trunk.attributes?.focus as Partial<FocusAttribute> | undefined;
      if (!focus || typeof focus.prefix !== 'string' || !focus.prefix) return [];
      if (Array.isArray(focus.realms) && focus.realms.length > 0 && !focus.realms.includes(realm)) return [];
      return [{ prefix: focus.prefix, trunk: trunk.name }];
    });
  }

  /** The rooms with somebody in them, grouped from the live calls whose focus is set. */
  private rooms(): Conference[] {
    const byUri = new Map<string, Conference>();
    for (const call of this.calls) {
      if (!call.focus || call.state === 'Closed') continue;
      const room = byUri.get(call.focus) ?? { uri: call.focus, focus: null, participants: [] };
      byUri.set(call.focus, room);
      const caller = call.participants.find((participant) => participant.originator);
      const towards = call.participants.find((participant) => !participant.originator);
      if (call.answered_age_s !== null && towards?.trunk) room.focus = towards.trunk;
      const identity = caller?.identity ?? 'unknown';
      room.participants.push({
        call: call.id,
        identity,
        subscriber: caller?.trunk ? null : identity,
        state: call.state as Conference['participants'][number]['state'],
        joined_at: new Date(Date.now() - call.age_s * 1000).toISOString(),
        node: 'sip-0001',
      });
    }
    return [...byUri.values()];
  }

  /** Checks a trunk write whole before any of it is kept: the node's 400 changes nothing. */
  private trunkWrite(write: TrunkWrite): void {
    if (write.name !== undefined && !/^[A-Za-z0-9._-]{1,64}$/.test(write.name)) {
      throw new ApiError('name must be 1 to 64 letters, digits, dots, dashes or underscores', 400, 'invalid_request');
    }
    if (write.uri !== undefined && !/^sips?:/i.test(write.uri.trim())) {
      throw new ApiError('uri must be a sip: or sips: URI', 400, 'invalid_request');
    }
    if (write.proxy && !/^sips?:/i.test(write.proxy.trim())) {
      throw new ApiError('proxy must be a sip: or sips: URI', 400, 'invalid_request');
    }
    const expires = write.register?.expires;
    if (expires !== undefined && (!Number.isInteger(expires) || expires < TRUNK_EXPIRES_MIN || expires > TRUNK_EXPIRES_MAX)) {
      throw new ApiError(`register.expires must be ${TRUNK_EXPIRES_MIN} to ${TRUNK_EXPIRES_MAX} seconds`, 400, 'invalid_request');
    }
    if (write.inbound_addresses !== undefined && !Array.isArray(write.inbound_addresses)) {
      throw new ApiError('inbound_addresses must be a list', 400, 'invalid_request');
    }
    this.attributes(write.attributes);
  }

  /** Attributes are any JSON object; anything else is a 400. */
  private attributes(attributes: unknown): Attributes | undefined {
    if (attributes === undefined) return undefined;
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
      throw new ApiError('attributes must be an object', 400, 'invalid_request');
    }
    return attributes as Attributes;
  }

  /** A trunk as the API gives it: never its password. */
  private publicTrunk({ password: _password, ...trunk }: Trunk): Trunk {
    return trunk;
  }

  private realm(name: string, behaviour: RealmBehaviour = { media_anchor: null, media_profile: null, qualify_interval: null, rewrite_contact: null }): StoredRealm {
    return {
      name,
      id: this.nextId++,
      nonce_expiry: 300,
      registration_timeout: 5000,
      registration_minimum: 0,
      behaviour: { dtmf: null, ...behaviour },
      attributes: {},
    };
  }

  private present(realm: StoredRealm): Realm {
    return {
      ...realm,
      behaviour_effective: {
        media_anchor: realm.behaviour.media_anchor ?? SERVER_BEHAVIOUR.media_anchor,
        media_profile: realm.behaviour.media_profile ?? SERVER_BEHAVIOUR.media_profile,
        dtmf: realm.behaviour.dtmf ?? SERVER_BEHAVIOUR.dtmf,
        qualify_interval: realm.behaviour.qualify_interval ?? SERVER_BEHAVIOUR.qualify_interval,
        rewrite_contact: realm.behaviour.rewrite_contact ?? SERVER_BEHAVIOUR.rewrite_contact,
      },
      behaviour_default: { ...SERVER_BEHAVIOUR },
    };
  }

  private subscriber(realm: string, user: string, media_profile: MediaProfile | null = null): Subscriber {
    return { id: this.nextId++, uri: `sip:${user}@${realm}`, user, realm, behaviour: { media_profile, dtmf: null }, attributes: {} };
  }

  /** A subscriber's behaviour, checked whole before any of it is kept: the node's 400 changes nothing. */
  private subscriberBehaviour(behaviour: SubscriberBehaviour | undefined): SubscriberBehaviour {
    if (behaviour === undefined) return {};
    for (const key of Object.keys(behaviour)) {
      if (key !== 'media_profile' && key !== 'dtmf') throw new ApiError(`a subscriber's behaviour has no setting called ${key}`, 400, 'invalid_request');
    }
    const profile = behaviour.media_profile;
    if (profile !== undefined && profile !== null && !MEDIA_PROFILES.includes(profile)) {
      throw new ApiError(`there is no media profile called ${String(profile)}`, 400, 'invalid_request');
    }
    const dtmf = behaviour.dtmf;
    if (dtmf !== undefined && dtmf !== null && !DTMF_MODES.includes(dtmf)) {
      throw new ApiError(`there is no dtmf setting called ${String(dtmf)}`, 400, 'invalid_request');
    }
    return behaviour;
  }


  /** Runs a route: its role check, with the server's codes and wording, then the work. `undefined` roles means open. */
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
    // Cloned, as a real response is a copy: a screen that mutates its result
    // must not change the store.
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

  /** Checks the whole change before making any of it: the node's 400 changes nothing. */
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
      if (!['media_anchor', 'media_profile', 'dtmf', 'qualify_interval', 'rewrite_contact'].includes(key)) {
        throw new ApiError(`there is no behaviour setting called ${key}`, 400, 'invalid_request');
      }
    }
    const { media_anchor: anchor, media_profile: profile, dtmf, qualify_interval: qualify, rewrite_contact: rewrite } = behaviour;
    if (dtmf !== undefined && dtmf !== null && !DTMF_MODES.includes(dtmf)) {
      throw new ApiError(`there is no dtmf setting called ${String(dtmf)}`, 400, 'invalid_request');
    }
    const attributes = this.attributes(changes.attributes);
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
    // Left out is left alone; null goes back to inheriting.
    if (anchor !== undefined) realm.behaviour.media_anchor = anchor;
    if (profile !== undefined) realm.behaviour.media_profile = profile;
    if (dtmf !== undefined) realm.behaviour.dtmf = dtmf;
    // Replaced whole when given.
    if (attributes !== undefined) realm.attributes = attributes;
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
   * No `websocket_uri`, as this node has no `wss` listener. STUN only: no
   * TURN credential is minted. Subscriber passwords are not kept, so any
   * non-empty one signs; an unknown subscriber is a 401, as on the node.
   */
  subscriberConfig(line: SubscriberLine, signal?: AbortSignal): Promise<ClientConfig> {
    return this.settle(undefined, () => {
      this.find(line.realm);
      if (!line.password || !this.subscribers.some((candidate) => candidate.realm === line.realm && candidate.user === line.user)) {
        throw new ApiError('wrong SIP username or password for this realm', 401, 'unauthorized');
      }
      return {
        transports: FAKE_TRANSPORTS,
        ice_servers: [{ urls: 'stun:203.0.113.5:3478' }],
        realm: {
          name: line.realm,
          registration: { expires: 300, minimum: 0 },
          outbound: { flows: 1 },
          push: [],
          conferences: this.conferencePrefixes(line.realm),
        },
      };
    }, signal);
  }

  nodes(signal?: AbortSignal): Promise<ClusterNode[]> {
    return this.settle(STATUS, () => [
      { id: 'sip-0001', self: true, status: 'ok', version: '0.13.0', transports: FAKE_TRANSPORTS, policy: { ...this.policy } },
      // A node that went quiet, still on the scripts before the last reload: still
      // listed, so it can be told from one never heard of.
      {
        id: 'sip-0002', self: false, status: 'ok', stale: true, version: '0.13.0',
        at: new Date(Date.now() - 95_000).toISOString(), transports: FAKE_TRANSPORTS_2,
        cluster: { address: '203.0.113.6', port: 5062 },
        policy: { driver: 'lua 1.0.0', fingerprint: '1a0b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9' },
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
      if (!isRealmName(name)) throw new ApiError('name is a host name: letters, digits, hyphens and dots', 400, 'invalid_request');
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
      // Its subscribers go with it, and their registrations with them.
      const gone = new Set(this.subscribers.filter((subscriber) => subscriber.realm === name).map((subscriber) => subscriber.uri));
      this.realms = this.realms.filter((candidate) => candidate.name !== name);
      this.subscribers = this.subscribers.filter((subscriber) => subscriber.realm !== name);
      this.registrations = this.registrations.filter((binding) => !gone.has(binding.subscriber));
      return undefined;
    }, signal);
  }

  listSubscribers(realm: string, signal?: AbortSignal): Promise<Subscriber[]> {
    return this.settle(SUBSCRIBERS, () => {
      this.find(realm);
      return this.subscribers.filter((subscriber) => subscriber.realm === realm);
    }, signal);
  }

  createSubscriber(realm: string, subscriber: CreateSubscriber, signal?: AbortSignal): Promise<Subscriber> {
    return this.settle(SUBSCRIBERS, () => {
      this.find(realm);
      const user = subscriber.user?.trim();
      if (!user) throw new ApiError('user is required', 400, 'invalid_request');
      if (!isSipUser(user)) throw new ApiError('user is a SIP user part: no @, colon, space or control character', 400, 'invalid_request');
      if (!subscriber.password) throw new ApiError('password or ha1 is required', 400, 'invalid_request');
      const behaviour = this.subscriberBehaviour(subscriber.behaviour);
      if (this.subscribers.some((candidate) => candidate.realm === realm && candidate.user === user)) {
        throw new ApiError('that subscriber already exists', 409, 'conflict');
      }
      const attributes = this.attributes(subscriber.attributes);
      const created = this.subscriber(realm, user, behaviour.media_profile ?? null);
      created.behaviour.dtmf = behaviour.dtmf ?? null;
      if (attributes) created.attributes = attributes;
      this.subscribers.push(created);
      return created;
    }, signal);
  }

  updateSubscriber(realm: string, user: string, changes: UpdateSubscriber, signal?: AbortSignal): Promise<Subscriber> {
    return this.settle(SUBSCRIBERS, () => {
      this.find(realm);
      const subscriber = this.subscribers.find((candidate) => candidate.realm === realm && candidate.user === user);
      if (!subscriber) throw new ApiError('no such subscriber', 404, 'not_found');
      if (changes.password === undefined && changes.behaviour === undefined && changes.attributes === undefined) {
        throw new ApiError('password, ha1, behaviour or attributes is required', 400, 'invalid_request');
      }
      if (changes.password !== undefined && !changes.password) throw new ApiError('password must not be empty', 400, 'invalid_request');
      const behaviour = this.subscriberBehaviour(changes.behaviour);
      const attributes = this.attributes(changes.attributes);
      // The password is not kept, as on the server.
      if (behaviour.media_profile !== undefined) subscriber.behaviour.media_profile = behaviour.media_profile;
      if (behaviour.dtmf !== undefined) subscriber.behaviour.dtmf = behaviour.dtmf;
      if (attributes !== undefined) subscriber.attributes = attributes;
      return subscriber;
    }, signal);
  }

  deleteSubscriber(realm: string, user: string, signal?: AbortSignal): Promise<void> {
    return this.settle(SUBSCRIBERS, () => {
      this.find(realm);
      const subscriber = this.subscribers.find((candidate) => candidate.realm === realm && candidate.user === user);
      if (!subscriber) throw new ApiError('no such subscriber', 404, 'not_found');
      this.subscribers = this.subscribers.filter((candidate) => candidate !== subscriber);
      // Its registrations go with it.
      this.registrations = this.registrations.filter((binding) => binding.subscriber !== subscriber.uri);
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
      focus: null,
      ...rest,
      created_at: instant(age_s),
      answered_at: instant(answered_age_s),
      media: media && {
        engine: media.engine,
        held: true,
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

  listCallRecords(limit = 100, signal?: AbortSignal): Promise<CallRecord[]> {
    return this.settle(STATUS, () => {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
        throw new ApiError('limit must be between 1 and 1000', 400, 'invalid_request');
      }
      const now = Date.now();
      const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();
      return this.records.slice(0, limit).map(({ ended_ago_s, rang_s, answered, ...record }) => ({
        ...record,
        ended_at: at(ended_ago_s),
        answered_at: record.duration || answered ? at(ended_ago_s + record.duration) : null,
        created_at: at(ended_ago_s + record.duration + rang_s),
      }));
    }, signal);
  }

  getCall(id: string, signal?: AbortSignal): Promise<Call> {
    return this.settle(STATUS, () => {
      const call = this.calls.find((candidate) => candidate.id === id);
      if (!call) throw new ApiError('no such call', 404, 'not_found');
      return this.liveCall(call);
    }, signal);
  }

  hangUpCall(id: string, signal?: AbortSignal): Promise<void> {
    return this.settle(CLUSTER, () => {
      const call = this.calls.find((candidate) => candidate.id === id);
      if (!call) throw new ApiError('no such call', 404, 'not_found');
      if (call.answered_age_s === null) {
        throw new ApiError('the call has not been answered; its caller ends it with a CANCEL', 409, 'not_answered');
      }
      this.endCall(id);
      return undefined;
    }, signal);
  }

  /** A call gone, and the bus told, as the node does once the BYEs are answered. */
  private endCall(id: string): void {
    const call = this.calls.find((candidate) => candidate.id === id);
    if (!call) return;
    this.calls = this.calls.filter((candidate) => candidate !== call);
    this.publish(`calls/${id}/state`, 'Closed');
    this.publish(`calls/${id}/unregister`, id);
  }

  listBans(signal?: AbortSignal): Promise<Ban[]> {
    return this.settle(STATUS, () => this.inForce(this.bans), signal);
  }

  liftBan(source: string, signal?: AbortSignal): Promise<void> {
    return this.settle(CLUSTER, () => {
      const held = this.inForce(this.bans).some((ban) => ban.source === source);
      this.bans = this.bans.filter((ban) => ban.source !== source);
      if (!held) throw new ApiError('this node holds no ban on that address', 404, 'not_found');
      return undefined;
    }, signal);
  }

  listClosedAors(signal?: AbortSignal): Promise<ClosedAor[]> {
    return this.settle(STATUS, () => this.inForce(this.closed), signal);
  }

  reopenAor(aor: string, signal?: AbortSignal): Promise<void> {
    // Matched as sip:user@host with the host lowercased, as the node does.
    const key = aor.replace(/@([^;>]*)$/, (_, host: string) => `@${host.toLowerCase()}`);
    return this.settle(CLUSTER, () => {
      const held = this.inForce(this.closed).some((closure) => closure.aor === key);
      this.closed = this.closed.filter((closure) => closure.aor !== key);
      if (!held) throw new ApiError('this node holds no closure of that address of record', 404, 'not_found');
      return undefined;
    }, signal);
  }

  /** What has not ended yet, soonest to end first, as the node lists it. */
  private inForce<T extends { ends: number }>(held: T[]): Array<Omit<T, 'ends'> & { until: string; seconds_left: number }> {
    const now = Date.now();
    return held
      .filter((entry) => entry.ends > now)
      .sort((a, b) => a.ends - b.ends)
      .map(({ ends, ...entry }) => ({ ...entry, until: new Date(ends).toISOString(), seconds_left: Math.ceil((ends - now) / 1000) }));
  }

  listConferences(signal?: AbortSignal): Promise<Conference[]> {
    return this.settle(STATUS, () => this.rooms(), signal);
  }

  getConference(uri: string, signal?: AbortSignal): Promise<Conference> {
    return this.settle(STATUS, () => {
      const room = this.rooms().find((candidate) => candidate.uri === canonicalRoom(uri));
      if (!room) throw new ApiError('nobody is in that room', 404, 'not_found');
      return room;
    }, signal);
  }

  removeConferenceParticipant(uri: string, call: string, signal?: AbortSignal): Promise<void> {
    return this.settle(CLUSTER, () => {
      const leg = this.calls.find((candidate) => candidate.id === call && candidate.focus === canonicalRoom(uri));
      if (!leg) throw new ApiError('no live call with that Call-ID in that room', 404, 'not_found');
      if (leg.answered_age_s === null) {
        throw new ApiError('the focus has not answered yet; the caller ends it with a CANCEL', 409, 'not_answered');
      }
      this.endCall(call);
      return undefined;
    }, signal);
  }

  listTrunks(signal?: AbortSignal): Promise<Trunk[]> {
    return this.settle(TRUNKS, () => this.trunks.map((trunk) => this.publicTrunk(trunk)), signal);
  }

  createTrunk(trunk: TrunkWrite & { name: string; uri: string }, signal?: AbortSignal): Promise<Trunk> {
    return this.settle(TRUNKS, () => {
      if (!trunk.name?.trim()) throw new ApiError('name is required', 400, 'invalid_request');
      if (!trunk.uri?.trim()) throw new ApiError('uri is required', 400, 'invalid_request');
      this.trunkWrite(trunk);
      if (this.trunks.some((candidate) => same(candidate.name, trunk.name))) {
        throw new ApiError(`trunk ${trunk.name} already exists`, 409, 'conflict');
      }
      const { password, ...rest } = trunk;
      const created: Trunk = {
        register: { enabled: false },
        inbound_addresses: [],
        tls_ca: '',
        attributes: {},
        ...rest,
        password,
        password_set: Boolean(password),
        created_at: Math.floor(Date.now() / 1000),
        registration: null,
      };
      this.trunks.push(created);
      this.publish('trunks/changed', created.name);
      return this.publicTrunk(created);
    }, signal);
  }

  updateTrunk(name: string, changes: TrunkWrite, signal?: AbortSignal): Promise<Trunk> {
    return this.settle(TRUNKS, () => {
      const trunk = this.trunk(name);
      if (changes.name !== undefined && changes.name !== trunk.name) {
        throw new ApiError('a trunk cannot be renamed', 400, 'invalid_request');
      }
      this.trunkWrite(changes);
      const { password, register, ...rest } = changes;
      Object.assign(trunk, rest);
      if (register !== undefined) trunk.register = { ...trunk.register, ...register };
      if (password !== undefined) {
        trunk.password = password;
        trunk.password_set = Boolean(password);
      }
      if (trunk.register?.enabled === false) trunk.registration = null;
      this.publish('trunks/changed', trunk.name);
      return this.publicTrunk(trunk);
    }, signal);
  }

  deleteTrunk(name: string, signal?: AbortSignal): Promise<void> {
    return this.settle(TRUNKS, () => {
      const trunk = this.trunk(name);
      this.trunks = this.trunks.filter((candidate) => candidate !== trunk);
      this.publish('trunks/changed', trunk.name);
      return undefined;
    }, signal);
  }

  /** The answering node reads its scripts again, which brings it into line with any it had fallen out of. */
  reloadPolicy(signal?: AbortSignal): Promise<PolicyReload> {
    return this.settle(CLUSTER, () => ({ ...this.policy }), signal);
  }

  /** From whether the subscriber has a registration, as with nothing published. */
  subscriberPresence(realm: string, user: string, signal?: AbortSignal): Promise<Presence> {
    return this.settle(SUBSCRIBERS, () => {
      this.find(realm);
      const subscriber = this.subscribers.find((candidate) => candidate.realm === realm && candidate.user === user);
      if (!subscriber) throw new ApiError('no such subscriber', 404, 'not_found');
      const open = this.registrations.some((binding) => binding.subscriber === subscriber.uri);
      return { subscriber: subscriber.uri, basic: open ? 'open' : 'closed', source: 'registrations', publications: [] };
    }, signal);
  }

  /** A receptionist's BLF keys: one on a colleague, one on the sales room. */
  listPresenceSubscriptions(signal?: AbortSignal): Promise<PresenceSubscription[]> {
    return this.settle(STATUS, () => {
      const expires = Math.floor(Date.now() / 1000) + 1800;
      return [
        { id: 'sub-1', watcher: 'sip:reception@blackraven.co.nz', presentity: 'sip:tom@sip.athenasip.org', package: 'dialog', node_id: 'sip-0001', expires_at: expires },
        { id: 'sub-2', watcher: 'sip:tom@sip.athenasip.org', presentity: 'sip:conf-sales@sip.athenasip.org', package: 'dialog', node_id: 'sip-0001', expires_at: expires },
      ];
    }, signal);
  }

  /**
   * Hears what this fake publishes as its writes happen, until `signal` aborts.
   * Retained topics, the nodes' and trunks' status, arrive first, as from a broker.
   */
  events(onEvent: (event: BusEvent) => void, signal: AbortSignal, onOpen?: () => void): Promise<void> {
    return this.settle(STATUS, () => undefined, signal).then(() => new Promise<void>((resolve) => {
      if (signal.aborted) { resolve(); return; }
      const listener = (event: BusEvent) => onEvent(structuredClone(event));
      this.listeners.add(listener);
      signal.addEventListener('abort', () => { this.listeners.delete(listener); resolve(); }, { once: true });
      onOpen?.();
      for (const trunk of this.trunks) {
        if (trunk.registration) listener({ topic: `trunks/${trunk.name}/status`, data: trunk.registration });
      }
    }));
  }

  /** How many are listening on `events`, for tests. Not part of `AdminApi`. */
  get eventListeners(): number {
    return this.listeners.size;
  }

  /** Publishes on the bus as if another node had, for tests. Not part of `AdminApi`. */
  publishElsewhere(topic: string, data: unknown): void {
    this.publish(topic, data);
  }

  /** Has the policy change on this node, as an edit to its scripts and a reload would. Not part of `AdminApi`. */
  changePolicyElsewhere(policy: PolicyReload): void {
    this.policy = { ...policy };
  }

  mediaEngine(signal?: AbortSignal): Promise<MediaEngine> {
    return this.settle(STATUS, () => ({ engine: 'builtin', connected: true, capabilities: ['bridge', 'dtmf'] }), signal);
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

  /** Ends a call, for tests. Not part of `AdminApi`. */
  endCallElsewhere(id: string): void {
    this.endCall(id);
  }

  /**
   * Another user's change, made outside this session with no role check: how
   * a test takes a role away mid-session. Not part of `AdminApi`.
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
      // A user cannot disable itself or give up `manage-admin-users`.
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
      // A caller with the role needs no old password: that is how a lost one is reset.
      // 403 with its own code, to tell a wrong body field from a missing role.
      if (own && !manager && change.old_password !== user.password) {
        throw new ApiError('the old password is not right', 403, 'wrong_password');
      }
      user.password = change.password;
      // Ends every session the user holds, including the one that asked.
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

/**
 * A room as the node names it: `sip:` + the user part as dialled + `@` + the
 * host lowercased, with no port, parameters or headers. The node records a
 * call's room so and reads a `{uri}` so, whatever was dialled.
 */
export function canonicalRoom(uri: string): string {
  const match = /^sips?:([^@;?>]+)@([^:;?>]+)/i.exec(uri.trim());
  return match ? `sip:${match[1]}@${match[2].toLowerCase()}` : uri;
}

/** Usernames are compared case-insensitively and stored as given. */
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

/**
 * Ended calls, newest first, held as offsets from now and turned into
 * instants at read time. `answered` marks a call answered and hung up within
 * the second, which a duration of 0 alone would read as unanswered.
 */
type StoredRecord = Omit<CallRecord, 'created_at' | 'answered_at' | 'ended_at'> & { ended_ago_s: number; rang_s: number; answered?: boolean };

const RECORDS: StoredRecord[] = [
  { id: 'r1@192.168.1.24', caller: 'sip:tom@sip.athenasip.org', callee: 'sip:tomweb@sip.athenasip.org', duration: 184, ended_ago_s: 900, rang_s: 6, nodes: ['corvus-fi-1'], media_engine: 'builtin' },
  { id: 'r2@203.0.113.40', caller: 'sip:reception@blackraven.co.nz', callee: 'sip:tom@sip.athenasip.org', duration: 0, ended_ago_s: 3_600, rang_s: 25, nodes: ['corvus-fi-1'], media_engine: null },
  { id: 'r3@192.168.1.24', caller: 'sip:tomweb@sip.athenasip.org', callee: 'sip:tom@sip.athenasip.org', duration: 42, ended_ago_s: 86_400, rang_s: 3, nodes: ['corvus-fi-1'], media_engine: 'builtin' },
];
