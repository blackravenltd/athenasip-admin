import type {
  Subscriber,
  Call,
  CallRecord,
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
  UpdateSubscriber,
  UpdateAdminUser,
  UpdateRealm,
} from './types';

/**
 * Everything this client can ask an AthenaSIP node to do.
 *
 * The contract is the server's `docs/api/openapi.yaml`, version 1: health,
 * the node list, realms, subscribers, registrations, live calls and the media
 * engine under `/api/v1`, with a session token from a user's login as the
 * bearer on everything but health and the login itself. Users and roles are
 * the server's `docs/authentication.md`.
 *
 * Two implementations, and the seam is the point:
 *
 *   - `HttpAdminApi` speaks to a real node. It is the only file in this
 *     repository that knows a URL, a verb or a status code exists.
 *   - `FakeAdminApi` holds the same records in memory and enforces the same
 *     rules, users and roles included. It is what development runs against
 *     without a node, and what every screen test runs against.
 *
 * Every method takes an `AbortSignal` because every one of them is called from
 * a component that can unmount mid-flight.
 */
export interface AdminApi {
  /**
   * Exchanges a username and password for a session. A 401 is a wrong
   * password or a disabled user and does not end any session in progress; a
   * 404 is a node that predates user logins, which this console cannot use.
   */
  login(username: string, password: string, signal?: AbortSignal): Promise<LoginResult>;
  /** Ends the presented session on the node. */
  logout(signal?: AbortSignal): Promise<void>;
  /** Who a session token is and what it may do, without keeping it: the session's own when `token` is left out. */
  session(token?: string, signal?: AbortSignal): Promise<SessionInfo>;

  /** Open. Resolves on a degraded node as well as a healthy one; the status says which. */
  health(signal?: AbortSignal): Promise<Health>;
  nodes(signal?: AbortSignal): Promise<ClusterNode[]>;
  /** Minted per request: fetch it when a call is placed, never cache it at sign-in. */
  clientConfig(signal?: AbortSignal): Promise<ClientConfig>;

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

  /** The calls this node is carrying now. Read only, and gone once ended. */
  listCalls(signal?: AbortSignal): Promise<Call[]>;
  /** Calls that have ended, newest first; `limit` 1 to 1000, the node's default 100. */
  listCallRecords(limit?: number, signal?: AbortSignal): Promise<CallRecord[]>;
  /** One live call by its Call-ID; a 404 once it has ended. */
  getCall(id: string, signal?: AbortSignal): Promise<Call>;
  /** The media engine and what it can do. */
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
  /** Ends every session the user holds, which is what makes disabling a user immediate. */
  revokeSessions(username: string, signal?: AbortSignal): Promise<void>;
}
