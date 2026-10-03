/**
 * What a failed admin API call looks like to a screen.
 *
 * The server answers every failure with one envelope,
 * `{"error": {"code": "...", "message": "..."}}`: a code a client branches on,
 * which does not change wording between releases, and a message for a person.
 * There is exactly one place that turns a response into this, and it is
 * `HttpAdminApi`.
 *
 * `status` is kept because the caller sometimes needs to distinguish: a 401 is
 * the session's problem and belongs to the shell, a `conflict` on a create is
 * this form's problem and belongs beside the field that caused it.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: ApiErrorCode | string;
  /** Seconds to wait, from `Retry-After`, when the node is rate limiting (429). */
  readonly retryAfter?: number;

  constructor(message: string, status: number, code?: ApiErrorCode | string, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }

  /** The token is missing or unknown: the session has ended, whatever the screen was doing. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** A known token without the role this needs. The session is fine; this screen is not for it. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** The node is rate limiting. Never a sign-out: the session is fine, it is asking too often. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/** How long to hold off after a 429 that named no Retry-After. */
export const DEFAULT_RETRY_AFTER_S = 10;

/** Seconds to wait before asking again, when a failure is the node rate limiting; undefined otherwise. */
export function retryAfter(cause: unknown): number | undefined {
  if (!(cause instanceof ApiError) || !cause.isRateLimited) return undefined;
  return cause.retryAfter ?? DEFAULT_RETRY_AFTER_S;
}

/** The codes the server's OpenAPI document lists. */
export type ApiErrorCode =
  | 'invalid_json'
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'conflict'
  | 'datastore_error'
  | 'unavailable'
  | 'would_lock_out'
  | 'unknown_role'
  | 'wrong_password';

/**
 * The message to show for any thrown value.
 *
 * Anything can reach a catch block: an `ApiError`, a `TypeError` from fetch
 * when the server is simply not there, an abort, a string somebody threw. A
 * screen should not have to know which, and must never render
 * "[object Object]" at somebody who is trying to work out why their SIP
 * server is unreachable.
 */
export function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError && cause.isRateLimited) {
    // Every route is rate limited, and the node's own wording would not say how long.
    return cause.retryAfter
      ? `The node is limiting requests. Try again in ${cause.retryAfter} second${cause.retryAfter === 1 ? '' : 's'}.`
      : 'The node is limiting requests. Wait a little and try again.';
  }
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  if (cause && typeof cause === 'object') {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
    return 'The server failed without saying why.';
  }
  return cause === undefined || cause === null
    ? 'The server failed without saying why.'
    : String(cause);
}

/**
 * Whether a failure is the caller cancelling, rather than something going
 * wrong. Every request in this client is abortable, so this case is ordinary
 * and must never surface as an error.
 */
export function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

/**
 * Whether a failure is the server refusing a create because the thing already exists.
 * A 409 `would_lock_out` is a different refusal, about the caller rather than the name.
 */
export function isConflict(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.code === 'conflict' || (cause.status === 409 && cause.code !== 'would_lock_out'));
}
