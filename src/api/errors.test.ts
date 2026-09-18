import { describe, expect, it } from 'vitest';
import { ApiError, errorMessage, isAbort } from './errors';

describe('errorMessage', () => {
  it('uses the server message when there is one', () => {
    expect(errorMessage(new ApiError('sip.example.org is already a realm on this server.', 409)))
      .toBe('sip.example.org is already a realm on this server.');
  });

  it('reads an ordinary Error, which is what an unreachable server produces', () => {
    // fetch rejects with a TypeError when there is nothing listening. That is
    // the most common failure this console will ever show.
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe('Failed to fetch');
  });

  it('never renders [object Object] at somebody trying to fix a server', () => {
    expect(errorMessage({ oops: true })).not.toContain('[object Object]');
  });
});

describe('ApiError', () => {
  it('treats 401 and 403 as the session failing rather than the request', () => {
    expect(new ApiError('Unauthorized', 401).isAuthFailure).toBe(true);
    expect(new ApiError('Forbidden', 403).isAuthFailure).toBe(true);
    expect(new ApiError('Conflict', 409).isAuthFailure).toBe(false);
  });
});

describe('isAbort', () => {
  it('recognises a cancelled request, which is ordinary and not a failure', () => {
    expect(isAbort(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isAbort(new Error('Aborted'))).toBe(false);
  });
});
