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

export interface HttpAdminApiOptions {
  /**
   * Where `/api/v1` lives. Empty by default, which means same-origin — the
   * deployment the server itself produces, where one process serves this
   * bundle and the API. A dev server proxies `/api` instead of setting this,
   * so development is same-origin too.
   */
  baseUrl?: string;
  /** Read on every request rather than captured, so a refreshed token is picked up. */
  token?: () => string | undefined;
  fetch?: typeof globalThis.fetch;
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
  private readonly http: typeof globalThis.fetch;

  constructor(options: HttpAdminApiOptions = {}) {
    // A trailing slash here and a leading slash below is the classic way to
    // produce `//api/v1`, which some proxies treat as a different path.
    this.baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
    this.token = options.token ?? (() => undefined);
    this.http = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = this.token();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await this.http(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });

    if (!response.ok) throw await describeFailure(response);
    // 204, and any other body-less success. `json()` on an empty body throws a
    // SyntaxError that would otherwise be reported as if the server had
    // answered badly.
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  status(signal?: AbortSignal) { return this.request<ServerStatus>('GET', '/status', undefined, signal); }

  listRealms(signal?: AbortSignal) { return this.request<Realm[]>('GET', '/realms', undefined, signal); }
  createRealm(realm: CreateRealm, signal?: AbortSignal) { return this.request<Realm>('POST', '/realms', realm, signal); }
  updateRealm(id: string, realm: Partial<CreateRealm>, signal?: AbortSignal) {
    return this.request<Realm>('PUT', `/realms/${encodeURIComponent(id)}`, realm, signal);
  }
  deleteRealm(id: string, signal?: AbortSignal) {
    return this.request<void>('DELETE', `/realms/${encodeURIComponent(id)}`, undefined, signal);
  }

  listSubscribers(realm: string, signal?: AbortSignal) {
    return this.request<Subscriber[]>('GET', `/realms/${encodeURIComponent(realm)}/subscribers`, undefined, signal);
  }
  createSubscriber(realm: string, subscriber: CreateSubscriber, signal?: AbortSignal) {
    return this.request<Subscriber>('POST', `/realms/${encodeURIComponent(realm)}/subscribers`, subscriber, signal);
  }
  updateSubscriber(realm: string, id: string, changes: UpdateSubscriber, signal?: AbortSignal) {
    return this.request<Subscriber>('PUT', `/realms/${encodeURIComponent(realm)}/subscribers/${encodeURIComponent(id)}`, changes, signal);
  }
  deleteSubscriber(realm: string, id: string, signal?: AbortSignal) {
    return this.request<void>('DELETE', `/realms/${encodeURIComponent(realm)}/subscribers/${encodeURIComponent(id)}`, undefined, signal);
  }

  listRegistrations(signal?: AbortSignal) { return this.request<Registration[]>('GET', '/registrations', undefined, signal); }

  rtpRelaySettings(signal?: AbortSignal) { return this.request<RtpRelaySettings>('GET', '/media/rtprelay', undefined, signal); }
  saveRtpRelaySettings(settings: RtpRelaySettings, signal?: AbortSignal) {
    return this.request<RtpRelaySettings>('PUT', '/media/rtprelay', settings, signal);
  }
}

/**
 * Turn a failed response into an `ApiError` without ever throwing while doing so.
 *
 * The server's error envelope is `{"message": "..."}`, but a failure is
 * exactly the moment a body is least trustworthy: a proxy in front of the
 * server answers 502 in HTML, a crashed handler sends nothing at all. Reading
 * the body must therefore never be able to replace the real failure with a
 * `SyntaxError` about position 0, which is how a "Service Unavailable" becomes
 * an unreadable bug report.
 */
async function describeFailure(response: Response): Promise<ApiError> {
  let message = `${response.status} ${response.statusText}`.trim();
  let code: string | undefined;
  try {
    const body = await response.text();
    if (body) {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === 'object') {
        const envelope = parsed as { message?: unknown; code?: unknown };
        if (typeof envelope.message === 'string' && envelope.message) message = envelope.message;
        if (typeof envelope.code === 'string') code = envelope.code;
      }
    }
  } catch {
    // Keep the status line. It is less specific and it is always true.
  }
  return new ApiError(message, response.status, code);
}
