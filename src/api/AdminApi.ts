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
 * Everything this client can ask an AthenaSIP server to do.
 *
 * This interface exists so the screens can be finished, reviewed and tested
 * before the server grows a single route. `AdminAPI` on the server side is
 * currently a Beast HTTP server with a middleware chain, a static-file
 * middleware and four status helpers — no `/api/v1`, no auth, no JSON body
 * parsing — and the endpoints below are the ones specified under "Admin API,
 * part 1" in `athenasip/TODO/ACTIVE.md`.
 *
 * Two implementations, and the seam is the point:
 *
 *   - `HttpAdminApi` speaks to a real server. It is the only file in this
 *     repository that knows a URL, a verb or a status code exists.
 *   - `FakeAdminApi` holds the same records in memory. It is what the app runs
 *     against today and what every screen test runs against, so a screen is
 *     exercised the same way in a test as in a browser.
 *
 * Every method takes an `AbortSignal` because every one of them is called from
 * a component that can unmount mid-flight.
 */
export interface AdminApi {
  /** What the dashboard reads: node identity, transports, counts. */
  status(signal?: AbortSignal): Promise<ServerStatus>;

  listRealms(signal?: AbortSignal): Promise<Realm[]>;
  createRealm(realm: CreateRealm, signal?: AbortSignal): Promise<Realm>;
  updateRealm(id: string, realm: Partial<CreateRealm>, signal?: AbortSignal): Promise<Realm>;
  deleteRealm(id: string, signal?: AbortSignal): Promise<void>;

  listSubscribers(realm: string, signal?: AbortSignal): Promise<Subscriber[]>;
  createSubscriber(realm: string, subscriber: CreateSubscriber, signal?: AbortSignal): Promise<Subscriber>;
  updateSubscriber(realm: string, id: string, changes: UpdateSubscriber, signal?: AbortSignal): Promise<Subscriber>;
  deleteSubscriber(realm: string, id: string, signal?: AbortSignal): Promise<void>;

  /** Read-only: a binding is created by a phone registering, never by an operator. */
  listRegistrations(signal?: AbortSignal): Promise<Registration[]>;

  rtpRelaySettings(signal?: AbortSignal): Promise<RtpRelaySettings>;
  saveRtpRelaySettings(settings: RtpRelaySettings, signal?: AbortSignal): Promise<RtpRelaySettings>;
}
