/**
 * The records the admin API deals in, as `docs/api/openapi.yaml` in the
 * server's checkout describes them.
 *
 * The field names are the wire names, snake_case, so a response needs no
 * translation layer to become one of these. Where the document says nothing
 * the server's own handlers were read (`src/api/provisioning_api.cpp`), and
 * what they settled is noted against the field.
 *
 * Ids are 64-bit on the server and a JavaScript number holds 53 bits, so an
 * id arrives rounded. Nothing in this client keys on one: a realm is keyed by
 * its name and an account by its user, which is how the API addresses them.
 */

export type SipTransport = 'udp' | 'tcp' | 'tls' | 'ws' | 'wss';

/**
 * What an admin user may do, from the server's `docs/authentication.md`.
 *
 * There is no superuser and nothing implies anything else: a user holds the
 * roles given and no others, possibly none. A role is a permission, not a
 * rank, so somebody who reads status and manages realms is given both.
 */
export type Role =
  | 'view-cluster-status'
  | 'manage-admin-users'
  | 'manage-realms'
  | 'manage-realm-subscribers'
  | 'manage-cluster';

export const ROLES: readonly Role[] = [
  'view-cluster-status',
  'manage-realms',
  'manage-realm-subscribers',
  'manage-admin-users',
  'manage-cluster',
];

/**
 * `GET /session`: who the presented session token is, and what it may do.
 * Every bearer is a user who logged in; the node has no configured tokens.
 */
export interface SessionInfo {
  /** Compared case-insensitively on the node, stored as given. */
  username: string;
  display_name: string;
  roles: Role[];
  /** Unix seconds, the absolute expiry. */
  expires_at?: number;
}

/** `POST /auth/login`. The token is opaque, presented as a bearer, and never retrievable again. */
export interface LoginResult {
  token: string;
  /** Unix seconds. */
  expires_at: number;
  roles: Role[];
}

/** A person or system that administers the node. Not a realm account, and never made from one. */
export interface AdminUser {
  username: string;
  display_name: string;
  roles: Role[];
  /** Kept for the audit trail; cannot log in. */
  disabled: boolean;
  /** Unix seconds. */
  created_at: number;
  /** Unix seconds; zero when the user has never logged in. */
  last_login_at: number;
}

export interface CreateAdminUser {
  username: string;
  display_name: string;
  password: string;
  /** None by default. */
  roles: Role[];
}

/** Only the fields given are changed. */
export interface UpdateAdminUser {
  display_name?: string;
  roles?: Role[];
  disabled?: boolean;
}

/** `old_password` is required to change your own, and not needed with `manage-admin-users`. */
export interface ChangePassword {
  password: string;
  old_password?: string;
}

/** `GET /health`. Open, with no token. */
export interface Health {
  /** `degraded` when the datastore is not connected, which the server answers with a 503. */
  status: 'ok' | 'degraded';
  node: string;
  version: string;
  /** The datastore driver and its version, as it describes itself. */
  datastore: string;
}

export interface NodeTransport {
  transport: SipTransport;
  address: string;
  port: number;
  /** The SIP URI a client would use for this transport. */
  uri: string;
}

/**
 * One entry of `GET /client/config`'s `ice_servers`, shaped as `RTCIceServer`.
 * A `turn:` entry carries a credential minted per request under the coturn
 * shared-secret scheme, or none when the node has no secret configured.
 */
export interface IceServer {
  urls: string;
  /** The credential's own expiry, optionally with a name after a colon. Not an identity. */
  username?: string;
  credential?: string;
  /** Unix seconds. The credential stops working by itself. */
  expires_at?: number;
}

/** `GET /client/config`: what a browser needs to place a call and cannot be told by hand. */
export interface ClientConfig {
  /** The secure WebSocket to signal over; absent when the node has no `wss` listener. */
  websocket_uri?: string;
  /** The same list `/nodes` gives. */
  transports: NodeTransport[];
  ice_servers: IceServer[];
}

/**
 * `GET /nodes`: this node first, marked `self`, then every other node as it
 * last described itself on the event bus.
 */
export interface ClusterNode {
  id: string;
  self: boolean;
  status?: 'ok' | 'degraded' | 'stopped' | 'down';
  /** Absent for this node; true when another node's report is more than three status intervals old. */
  stale?: boolean;
  version?: string;
  /** When the node composed its report, ISO 8601; absent for this node. */
  at?: string;
  /** One per enabled SIP transport. A transport that is off is absent, not listed as off. */
  transports: NodeTransport[];
}

/** What the media engine is asked to produce for a leg that has not said what it speaks. */
export type MediaProfile = 'mirror' | 'transport' | 'rtp' | 'webrtc' | 'srtp';

export const MEDIA_PROFILES: readonly MediaProfile[] = ['mirror', 'transport', 'rtp', 'webrtc', 'srtp'];

/**
 * What a realm does differently from the server's own `behaviour:` section.
 * A setting that is null inherits the server's; null in an update puts it
 * back to inheriting, and a setting left out of an update is left alone.
 */
export interface Behaviour {
  /** Whether this node puts itself in the media path when a media engine is configured. */
  media_anchor?: boolean | null;
  media_profile?: MediaProfile | null;
  /** Seconds between OPTIONS to each registered client; 0 for never, otherwise 5 to 86400. */
  qualify_interval?: number | null;
  /**
   * Rewrite the Contact of each message forwarded to the address and port it
   * came from, as Asterisk's `rewrite_contact`. WebSocket clients never are.
   */
  rewrite_contact?: boolean | null;
}

/** A complete behaviour: what a realm's comes to, or the server's own. */
export interface BehaviourEffective {
  media_anchor: boolean;
  media_profile: MediaProfile;
  qualify_interval: number;
  rewrite_contact: boolean;
}

/** The bounds the node puts on `qualify_interval` other than 0. */
export const QUALIFY_MIN = 5;
export const QUALIFY_MAX = 86400;

/** A SIP domain this server is responsible for. Addressed by `name`. */
export interface Realm {
  name: string;
  /** Rounded; see the note at the top of this file. */
  id: number;
  /** How long a Digest nonce stays good, in seconds. 3600 when not given. */
  nonce_expiry: number;
  /** The longest registration this realm grants, in seconds. 5000 when not given. */
  registration_timeout: number;
  /** The shortest registration it accepts, in seconds. Zero accepts any. */
  registration_minimum: number;
  /** As the realm set it: every setting present, null where it inherits. */
  behaviour: Required<Behaviour>;
  behaviour_effective: BehaviourEffective;
  /** The server's own `behaviour:` section on the node that answered: what a null setting inherits. */
  behaviour_default: BehaviourEffective;
}

export interface RealmSettings {
  nonce_expiry?: number;
  registration_timeout?: number;
  registration_minimum?: number;
  behaviour?: Behaviour;
}

/** `nonce_secret` is left to the server, which generates one, and never returned. */
export interface CreateRealm extends RealmSettings {
  name: string;
}

/** Only the fields given are changed. A realm cannot be renamed. */
export type UpdateRealm = RealmSettings;

/** One account in one realm. Addressed by `user` within its realm. */
export interface Account {
  /** Derived from the URI, so every node agrees on it. Rounded; see the top of this file. */
  id: number;
  uri: string;
  user: string;
  realm: string;
  /** As the account set it: null where it takes its realm's. */
  behaviour: Required<AccountBehaviour>;
}

/**
 * The one behaviour setting that is about an endpoint rather than a realm,
 * as Asterisk's `webrtc=yes` is: what the first description towards this
 * account's endpoint is. Above the realm's, below what the endpoint has itself
 * said. Null takes the realm's, and null in an update goes back to it.
 */
export interface AccountBehaviour {
  media_profile?: MediaProfile | null;
}

/** The server computes HA1 from the password and keeps only that. */
export interface CreateAccount {
  user: string;
  password: string;
  behaviour?: AccountBehaviour;
}

/** Either or both. A password left out is left alone. */
export interface UpdateAccount {
  password?: string;
  behaviour?: AccountBehaviour;
}

/** A live binding. Read only: a binding is written by a REGISTER and by nothing else. */
export interface Registration {
  /** The account's URI. */
  account: string;
  account_id: number;
  contact: string;
  /** Unix time in seconds, as the server's `std::time_t`. */
  registered_at: number;
  /** Unix time in seconds. */
  expires_at: number;
  /** The contact is on a private address, so replies go back down the flow. */
  nat: boolean;
  /** Which node holds the flow. Empty on a single node. */
  node_id: string;
  /** The connection it was learned over (RFC 5626). Empty on a single node. */
  flow_id: string;
  /** The RFC 3327 Path recorded at registration. */
  path: string;
}

/** Whether a transport carries signalling in the clear. */
export function isEncrypted(transport: SipTransport): boolean {
  return transport === 'tls' || transport === 'wss';
}

/** A call's state, as the server's `Call::state_to_string` spells it. */
export type CallState = 'Initial' | 'Trying' | 'Ringing' | 'Connected' | 'Closing' | 'Closed';

/** One party to a call, as its own signalling described it. */
export interface CallParticipant {
  /** The participant's SIP URI. */
  identity: string;
  /** The one who placed the call. */
  originator: boolean;
  /** What this participant's session description said it is; null until it has said. */
  profile: 'webrtc' | 'plain-rtp' | 'srtp-sdes' | null;
}

/**
 * One end of one stream, as the media engine sees it, cumulative since the
 * call began. `_in` is what arrived from that end, `_out` what the engine sent
 * it. A direction the engine does not report is absent, never zero:
 * rtpengine usually reports only the `_in` pair.
 */
export interface CallLeg {
  /**
   * An index into the call's participants. Always null today: a relay knows
   * an end by the address its packets come from, which behind a NAT is not
   * one any participant described.
   */
  participant: number | null;
  packets_in?: number;
  bytes_in?: number;
  packets_out?: number;
  bytes_out?: number;
}

export interface CallMedia {
  engine: string;
  /** How long all of the call's media has been silent, in seconds, when the engine can say. */
  idle_seconds: number | null;
  legs: CallLeg[];
}

/** `GET /calls`: one live call. An ended call is gone from the list. */
export interface Call {
  /** The Call-ID. */
  id: string;
  state: CallState;
  /** ISO 8601. */
  created_at: string | null;
  /** ISO 8601; null until answered. */
  answered_at: string | null;
  participants: CallParticipant[];
  /** Null when nothing anchors the call: the realm does not, or the node has no engine. */
  media: CallMedia | null;
}

/** `GET /media`: the engine's name and what it can do, never its URL. */
export interface MediaEngine {
  /** `builtin` or `rtpengine`; null when the node has no engine. */
  engine: string | null;
  connected: boolean;
  capabilities: string[];
}

/**
 * `GET /media/reoffers`: an account whose endpoint answered an offer with 488,
 * and was offered the other profile once. The node suggests and the operator
 * decides; nothing sets the account's profile.
 */
export interface MediaReoffer {
  /** The account's address of record, as the call's Request-URI named it. */
  account: string;
  rejected: 'rtp' | 'webrtc';
  /** Null when the other profile was refused as well. */
  took: 'rtp' | 'webrtc' | null;
  count: number;
  /** ISO 8601. */
  last_at: string;
  /** What the account's `behaviour.media_profile` would be set to. */
  suggested_media_profile: 'rtp' | 'webrtc' | null;
}

/** `GET /qualify`: a registered client this node is probing with OPTIONS, down the flow it registered on. */
export interface QualifiedClient {
  account: string;
  contact: string;
  /** Seconds between probes. */
  interval: number;
  /** ISO 8601; null until it has answered. */
  answered_at: string | null;
  /** Probes in a row that went unanswered. */
  unanswered: number;
  /** What media the client said it takes, when its answer carried a description. */
  said_media_profile: 'rtp' | 'webrtc' | 'srtp' | null;
}
