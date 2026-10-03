import type { AdminApi } from './AdminApi';
import { ApiError } from './errors';
import type {
  Subscriber,
  Call,
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
import { ROLES, type Role } from './types';

export interface HttpAdminApiOptions {
  /**
   * Where `/api/v1` lives. Empty by default, which means same-origin: the
   * deployment the server itself produces, where one process serves this
   * bundle and the API. A dev server proxies `/api` instead of setting this,
   * so development is same-origin too.
   */
  baseUrl?: string;
  /** Read on every request rather than captured, so a new token is picked up. */
  token?: () => string | undefined;
  /**
   * Called with every 401, before the request rejects. A 401 means the
   * token is gone or was never good, which is the session's problem rather
   * than the screen's, so the shell hears about it whichever screen asked.
   */
  onUnauthorized?: (error: ApiError) => void;
  /**
   * Called with every 403. A role can be taken away mid-session, and the
   * node re-checks on every request, so a 403 is the moment to re-read what
   * this session may do.
   */
  onForbidden?: (error: ApiError) => void;
  fetch?: typeof globalThis.fetch;
}

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
  /**
   * A token to send instead of the session's, or `''` for none. Either way
   * the request is not the session's, so its 401 and 403 do not end or
   * re-read the session.
   */
  token?: string;
  /** Statuses that are an answer rather than a failure, as a 503 from health is. */
  accept?: readonly number[];
}

/**
 * The only file that knows this client talks HTTP.
 *
 * Everything above it holds an `AdminApi` and never sees a URL, a verb or a
 * status code. That is what makes `FakeAdminApi` a real substitute rather than
 * a test-shaped approximation, and it is what keeps the day the server's wire
 * format changes to a one-file day.
 */
export class HttpAdminApi implements AdminApi {
  private readonly baseUrl: string;
  private readonly token: () => string | undefined;
  private readonly onUnauthorized: (error: ApiError) => void;
  private readonly onForbidden: (error: ApiError) => void;
  private readonly http: typeof globalThis.fetch;

  constructor(options: HttpAdminApiOptions = {}) {
    // A trailing slash here and a leading slash below is the classic way to
    // produce `//api/v1`, which some proxies treat as a different path.
    this.baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
    this.token = options.token ?? (() => undefined);
    this.onUnauthorized = options.onUnauthorized ?? (() => undefined);
    this.onForbidden = options.onForbidden ?? (() => undefined);
    this.http = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = options.token === undefined ? this.token() : options.token;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await this.http(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });

    if (!response.ok && !options.accept?.includes(response.status)) {
      const failure = await describeFailure(response);
      // A probe with a candidate token, or a login, is not the session failing.
      if (options.token === undefined) {
        if (failure.isUnauthorized) this.onUnauthorized(failure);
        // A wrong old password is about the body, not about what this session may do.
        if (failure.isForbidden && failure.code !== 'wrong_password') this.onForbidden(failure);
      }
      throw failure;
    }
    // 204, and any other body-less success. `json()` on an empty body throws a
    // SyntaxError that would otherwise be reported as if the server had
    // answered badly.
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  login(username: string, password: string, signal?: AbortSignal) {
    return this.request<LoginResult>('POST', '/auth/login', { body: { username, password }, token: '', signal });
  }

  logout(signal?: AbortSignal) {
    return this.request<void>('POST', '/auth/logout', { signal });
  }

  async session(token?: string, signal?: AbortSignal): Promise<SessionInfo> {
    const info = await this.request<Partial<SessionInfo>>('GET', '/session', { token, signal });
    return {
      username: typeof info?.username === 'string' ? info.username : '',
      display_name: typeof info?.display_name === 'string' ? info.display_name : '',
      roles: knownRoles(info?.roles),
      ...(typeof info?.expires_at === 'number' ? { expires_at: info.expires_at } : {}),
    };
  }

  health(signal?: AbortSignal) { return this.request<Health>('GET', '/health', { signal, accept: [503] }); }
  nodes(signal?: AbortSignal) { return this.request<ClusterNode[]>('GET', '/nodes', { signal }); }
  clientConfig(signal?: AbortSignal) { return this.request<ClientConfig>('GET', '/client/config', { signal }); }

  listRealms(signal?: AbortSignal) { return this.request<Realm[]>('GET', '/realms', { signal }); }
  createRealm(realm: CreateRealm, signal?: AbortSignal) {
    return this.request<Realm>('POST', '/realms', { body: realm, signal });
  }
  updateRealm(name: string, changes: UpdateRealm, signal?: AbortSignal) {
    return this.request<Realm>('PUT', `/realms/${segment(name)}`, { body: changes, signal });
  }
  deleteRealm(name: string, signal?: AbortSignal) {
    return this.request<void>('DELETE', `/realms/${segment(name)}`, { signal });
  }

  listSubscribers(realm: string, signal?: AbortSignal) {
    return this.request<Subscriber[]>('GET', `/realms/${segment(realm)}/subscribers`, { signal });
  }
  createSubscriber(realm: string, subscriber: CreateSubscriber, signal?: AbortSignal) {
    return this.request<Subscriber>('POST', `/realms/${segment(realm)}/subscribers`, { body: subscriber, signal });
  }
  updateSubscriber(realm: string, user: string, changes: UpdateSubscriber, signal?: AbortSignal) {
    return this.request<Subscriber>('PUT', `/realms/${segment(realm)}/subscribers/${segment(user)}`, { body: changes, signal });
  }
  deleteSubscriber(realm: string, user: string, signal?: AbortSignal) {
    return this.request<void>('DELETE', `/realms/${segment(realm)}/subscribers/${segment(user)}`, { signal });
  }

  listRegistrations(realm?: string, signal?: AbortSignal) {
    const query = realm ? `?realm=${encodeURIComponent(realm)}` : '';
    return this.request<Registration[]>('GET', `/registrations${query}`, { signal });
  }

  listCalls(signal?: AbortSignal) { return this.request<Call[]>('GET', '/calls', { signal }); }
  /** A Call-ID can hold `@` and `/`; encoded, it is still one segment. */
  getCall(id: string, signal?: AbortSignal) { return this.request<Call>('GET', `/calls/${segment(id)}`, { signal }); }
  mediaEngine(signal?: AbortSignal) { return this.request<MediaEngine>('GET', '/media', { signal }); }
  listMediaReoffers(signal?: AbortSignal) { return this.request<MediaReoffer[]>('GET', '/media/reoffers', { signal }); }
  listQualifiedClients(signal?: AbortSignal) { return this.request<QualifiedClient[]>('GET', '/qualify', { signal }); }

  listUsers(signal?: AbortSignal) { return this.request<AdminUser[]>('GET', '/users', { signal }); }
  createUser(user: CreateAdminUser, signal?: AbortSignal) {
    return this.request<AdminUser>('POST', '/users', { body: user, signal });
  }
  updateUser(username: string, changes: UpdateAdminUser, signal?: AbortSignal) {
    return this.request<AdminUser>('PUT', `/users/${segment(username)}`, { body: changes, signal });
  }
  deleteUser(username: string, signal?: AbortSignal) {
    return this.request<void>('DELETE', `/users/${segment(username)}`, { signal });
  }
  changePassword(username: string, change: ChangePassword, signal?: AbortSignal) {
    return this.request<void>('POST', `/users/${segment(username)}/password`, { body: change, signal });
  }
  revokeSessions(username: string, signal?: AbortSignal) {
    return this.request<void>('DELETE', `/users/${segment(username)}/sessions`, { signal });
  }
}

/** The roles this client knows, from whatever the node sent. A role it does not know is ignored, not guessed at. */
function knownRoles(value: unknown): Role[] {
  const given = Array.isArray(value) ? value : [];
  return ROLES.filter((role) => given.includes(role));
}

/**
 * One path segment. The OpenAPI document says a user containing `@` or `/`
 * is one segment, not two, which `encodeURIComponent` gives, and a realm name
 * with a slash in it must not reach another route.
 */
function segment(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Turn a failed response into an `ApiError` without ever throwing while doing so.
 *
 * The envelope is `{"error": {"code", "message"}}`, but a failure is exactly
 * the moment a body is least trustworthy: a proxy in front of the server
 * answers 502 in HTML, a crashed handler sends nothing at all. Reading the
 * body must never replace the real failure with a `SyntaxError` about
 * position 0, which is how a "Service Unavailable" becomes an unreadable bug
 * report.
 */
async function describeFailure(response: Response): Promise<ApiError> {
  let message = `${response.status} ${response.statusText}`.trim();
  let code: string | undefined;
  try {
    const body = await response.text();
    if (body) {
      const parsed: unknown = JSON.parse(body);
      const envelope = parsed && typeof parsed === 'object' ? (parsed as { error?: unknown }).error : undefined;
      if (envelope && typeof envelope === 'object') {
        const { message: said, code: named } = envelope as { message?: unknown; code?: unknown };
        if (typeof said === 'string' && said) message = said;
        if (typeof named === 'string') code = named;
      }
    }
  } catch {
    // Keep the status line. It is less specific and it is always true.
  }
  const retry = Number(response.headers.get('Retry-After'));
  return new ApiError(message, response.status, code, Number.isFinite(retry) && retry > 0 ? retry : undefined);
}
