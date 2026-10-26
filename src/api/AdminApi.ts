import type {
  Subscriber,
  BusEvent,
  Call,
  CallRecord,
  Ban,
  ClosedAor,
  Conference,
  Presence,
  PresenceSubscription,
  PolicyReload,
  Trunk,
  TrunkWrite,
  AdminUser,
  ChangePassword,
  ClientConfig,
  ClusterNode,
  CreateAdminUser,
  CreateSubscriber,
  CreateRealm,
  Health,
  Realm,
  LoginResult,
  MediaEngine,
  MediaReoffer,
  QualifiedClient,
  Registration,
  SessionInfo,
  SubscriberLine,
  UpdateSubscriber,
  UpdateAdminUser,
  UpdateRealm,
} from './types';

/**
 * Everything this client can ask an AthenaSIP node to do, per the server's
 * `docs/api/openapi.yaml` (version 1, under `/api/v1`) and
 * `docs/authentication.md`. A session token from a login is the bearer on
 * everything but health, the login itself, and a subscriber's own routes.
 *
 * `HttpAdminApi` speaks to a real node and is the only file that knows HTTP.
 * `FakeAdminApi` holds the same records in memory and enforces the same
 * rules; development without a node and every screen test run against it.
 *
 * Every method takes an `AbortSignal` so a component that unmounts
 * mid-flight can cancel.
 */
export interface AdminApi {
  /**
   * Exchanges a username and password for a session. A 401 is a wrong
   * password or a disabled user and does not end any session in progress; a
   * 404 is a node without user logins, which this console cannot use.
   */
  login(username: string, password: string, signal?: AbortSignal): Promise<LoginResult>;
  /** Ends the presented session on the node. */
  logout(signal?: AbortSignal): Promise<void>;
  /** Who a token is and what it may do, without keeping it. The session's own when `token` is left out. */
  session(token?: string, signal?: AbortSignal): Promise<SessionInfo>;

  /** Open. Resolves on a degraded node too; the status says which. */
  health(signal?: AbortSignal): Promise<Health>;
  nodes(signal?: AbortSignal): Promise<ClusterNode[]>;
  /**
   * Signed with the subscriber's own SIP credentials, not the session: a 401
   * is a wrong password for the line and ends no session. The TURN credential
   * is minted per request, so fetch it as a call is placed, never cache it.
   */
  subscriberConfig(line: SubscriberLine, signal?: AbortSignal): Promise<ClientConfig>;

  listRealms(signal?: AbortSignal): Promise<Realm[]>;
  createRealm(realm: CreateRealm, signal?: AbortSignal): Promise<Realm>;
  updateRealm(name: string, changes: UpdateRealm, signal?: AbortSignal): Promise<Realm>;
  deleteRealm(name: string, signal?: AbortSignal): Promise<void>;

  listSubscribers(realm: string, signal?: AbortSignal): Promise<Subscriber[]>;
  createSubscriber(realm: string, subscriber: CreateSubscriber, signal?: AbortSignal): Promise<Subscriber>;
  updateSubscriber(realm: string, user: string, changes: UpdateSubscriber, signal?: AbortSignal): Promise<Subscriber>;
  deleteSubscriber(realm: string, user: string, signal?: AbortSignal): Promise<void>;

  /** Read only. Every realm's when `realm` is left out. */
  listRegistrations(realm?: string, signal?: AbortSignal): Promise<Registration[]>;

  /** The calls this node is carrying. Read only; a call is gone once ended. */
  listCalls(signal?: AbortSignal): Promise<Call[]>;
  /** Calls that have ended, newest first; `limit` 1 to 1000, the node's default 100. */
  listCallRecords(limit?: number, signal?: AbortSignal): Promise<CallRecord[]>;
  /** One live call by its Call-ID; a 404 once it has ended. */
  getCall(id: string, signal?: AbortSignal): Promise<Call>;
  /**
   * Ends a live call with a BYE to each end (`manage-cluster`). Resolves once
   * the BYEs are sent; the call leaves the list as the ends answer. A 409
   * `not_answered` is a call still ringing, which only its caller can cancel.
   */
  hangUpCall(id: string, signal?: AbortSignal): Promise<void>;

  /** The rooms with somebody in them (RFC 4579), from the call records. */
  listConferences(signal?: AbortSignal): Promise<Conference[]>;
  /** One room by its conference URI; a 404 once nobody is in it. */
  getConference(uri: string, signal?: AbortSignal): Promise<Conference>;
  /** Ends one participant's call in a room (`manage-cluster`); 409 `not_answered` before the focus answers. */
  removeConferenceParticipant(uri: string, call: string, signal?: AbortSignal): Promise<void>;

  /** The addresses banned for guessing passwords over SIP, soonest to end first. */
  listBans(signal?: AbortSignal): Promise<Ban[]>;
  /**
   * Lifts a ban on every node and forgets the address's failures
   * (`manage-cluster`). A 404 is a ban this node did not hold; the others are
   * still told.
   */
  liftBan(source: string, signal?: AbortSignal): Promise<void>;
  /** The addresses of record closed to strangers for guessing, soonest to end first. */
  listClosedAors(signal?: AbortSignal): Promise<ClosedAor[]>;
  /** Reopens an address of record on every node, as `liftBan` does an address (`manage-cluster`). */
  reopenAor(aor: string, signal?: AbortSignal): Promise<void>;

  /** Every trunk (`manage-trunks`). Passwords are never returned. */
  listTrunks(signal?: AbortSignal): Promise<Trunk[]>;
  createTrunk(trunk: TrunkWrite & { name: string; uri: string }, signal?: AbortSignal): Promise<Trunk>;
  /** Only the fields given change; `attributes` given replaces the whole set. */
  updateTrunk(name: string, changes: TrunkWrite, signal?: AbortSignal): Promise<Trunk>;
  deleteTrunk(name: string, signal?: AbortSignal): Promise<void>;

  /** Has the answering node read its routing scripts again (`manage-cluster`); 422 when they do not load. */
  reloadPolicy(signal?: AbortSignal): Promise<PolicyReload>;

  /** A subscriber as its watchers are told (`manage-realm-subscribers`); 404 `presence_off` on a node without presence. */
  subscriberPresence(realm: string, user: string, signal?: AbortSignal): Promise<Presence>;
  /** Who watches whom, across the cluster. */
  listPresenceSubscriptions(signal?: AbortSignal): Promise<PresenceSubscription[]>;

  /**
   * The event bus (`view-cluster-status`): calls `onEvent` for each message
   * on `nodes/#`, `subscribers/#`, `calls/#`, `trunks/#` and `presence/#`
   * until `signal` aborts or the stream ends, then resolves. Rejects on a
   * refusal, such as a 503 `too_many_streams`, and when the connection drops.
   * `onOpen` is called once the node has accepted the stream.
   */
  events(onEvent: (event: BusEvent) => void, signal: AbortSignal, onOpen?: () => void): Promise<void>;
  mediaEngine(signal?: AbortSignal): Promise<MediaEngine>;
  /** Subscribers whose endpoint refused the media profile it was offered, most recent first. */
  listMediaReoffers(signal?: AbortSignal): Promise<MediaReoffer[]>;
  /** The registered clients this node is probing with OPTIONS. */
  listQualifiedClients(signal?: AbortSignal): Promise<QualifiedClient[]>;

  listUsers(signal?: AbortSignal): Promise<AdminUser[]>;
  createUser(user: CreateAdminUser, signal?: AbortSignal): Promise<AdminUser>;
  updateUser(username: string, changes: UpdateAdminUser, signal?: AbortSignal): Promise<AdminUser>;
  deleteUser(username: string, signal?: AbortSignal): Promise<void>;
  changePassword(username: string, change: ChangePassword, signal?: AbortSignal): Promise<void>;
  /** Ends every session the user holds. */
  revokeSessions(username: string, signal?: AbortSignal): Promise<void>;
}
