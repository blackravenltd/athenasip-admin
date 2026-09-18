import { describe, expect, it, vi } from 'vitest';
import { HttpAdminApi } from './HttpAdminApi';
import { ApiError } from './errors';

/**
 * A fetch that answers once. `null` rather than `''` for a body-less status:
 * the Response constructor rejects any body at all on a 204, so passing an
 * empty string tests the helper rather than the client.
 */
function respond(body: string | null, init: ResponseInit): typeof globalThis.fetch {
  return vi.fn(async () => new Response(body, init)) as unknown as typeof globalThis.fetch;
}

describe('HttpAdminApi', () => {
  it('addresses /api/v1 on the same origin by default', async () => {
    const fetch = respond('[]', { status: 200 });
    await new HttpAdminApi({ fetch }).listRealms();
    expect(fetch).toHaveBeenCalledWith('/api/v1/realms', expect.anything());
  });

  it('does not produce a double slash when a base URL has a trailing one', async () => {
    // `//api/v1` is a different path to some proxies, and the bug only shows
    // up against the one deployment that is not same-origin.
    const fetch = respond('[]', { status: 200 });
    await new HttpAdminApi({ baseUrl: 'https://sip.example.org/', fetch }).listRealms();
    expect(fetch).toHaveBeenCalledWith('https://sip.example.org/api/v1/realms', expect.anything());
  });

  it('sends the token that is current at request time, not at construction time', async () => {
    let token = 'first';
    const fetch = respond('[]', { status: 200 });
    const api = new HttpAdminApi({ fetch, token: () => token });
    await api.listRealms();
    token = 'second';
    await api.listRealms();

    const calls = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    const headerOf = (index: number) => (calls[index][1].headers as Record<string, string>).Authorization;
    expect(headerOf(0)).toBe('Bearer first');
    expect(headerOf(1)).toBe('Bearer second');
  });

  it('escapes a realm name, so a domain with a slash cannot reach another route', async () => {
    const fetch = respond('[]', { status: 200 });
    await new HttpAdminApi({ fetch }).listSubscribers('a/../b');
    expect(fetch).toHaveBeenCalledWith('/api/v1/realms/a%2F..%2Fb/subscribers', expect.anything());
  });

  it("reads the server's error envelope", async () => {
    const fetch = respond(JSON.stringify({ message: 'Realm not empty' }), { status: 409 });
    await expect(new HttpAdminApi({ fetch }).deleteRealm('realm-1')).rejects.toMatchObject({
      message: 'Realm not empty',
      status: 409,
    });
  });

  it('keeps the status line when the body is not the envelope', async () => {
    // A proxy in front of the server answers in HTML. Parsing must not replace
    // "502 Bad Gateway" with a SyntaxError about position 0.
    const fetch = respond('<html>502 Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' });
    const failure = await new HttpAdminApi({ fetch }).listRealms().catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe('502 Bad Gateway');
    expect((failure as ApiError).status).toBe(502);
  });

  it('survives a success with no body at all', async () => {
    // DELETE answers 204. Calling json() on that throws, and the delete would
    // be reported as failed after having actually succeeded.
    const fetch = respond(null, { status: 204 });
    await expect(new HttpAdminApi({ fetch }).deleteRealm('realm-1')).resolves.toBeUndefined();
  });
});
