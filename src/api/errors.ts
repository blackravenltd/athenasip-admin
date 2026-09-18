/**
 * What a failed admin API call looks like to a screen.
 *
 * The server answers every error the same way — an HTTP status and a JSON body
 * of `{"message": "..."}` (`athenasip/src/api/admin_api.cpp`, `send_status_end`)
 * — so there is exactly one place that turns a response into something a
 * screen can render, and it is here.
 *
 * `status` is kept because the caller sometimes needs to distinguish: a 401 is
 * the session's problem and belongs to the shell, a 409 is this form's problem
 * and belongs beside the field that caused it. `code` is reserved for the
 * machine-readable discriminator the server does not send yet; when it does,
 * nothing above this file has to change to start reading it.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** Whether the session, rather than the request, is what the server objected to. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/**
 * The message to show for any thrown value.
 *
 * Anything can reach a catch block — an `ApiError`, a `TypeError` from fetch
 * when the server is simply not there, an abort, a string somebody threw. A
 * screen should not have to know which, and must never render
 * "[object Object]" at somebody who is trying to work out why their SIP
 * server is unreachable.
 */
export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  // A rejected value that is neither. `String(cause)` is the obvious next
  // step and the wrong one: on any plain object it produces the literal text
  // "[object Object]", which tells somebody debugging a SIP server nothing
  // whatsoever. A `message` property is what such a value almost always
  // carries; failing that, say plainly that there was no message.
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
