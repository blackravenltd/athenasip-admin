/**
 * Where the fixture is and who is provisioned on it.
 *
 * The names are the ones `test/interop/up.sh` in the server's checkout
 * already exports, so a wrapper there passes its own environment through and
 * sets nothing new. Every default is the fixture's own default.
 */
export interface Fixture {
  /** Where the softphone page is opened from. Loopback, so the origin is a secure context. */
  pageUrl: string;
  /** The API at the same listener, used only to check the node is serving. */
  apiUrl: string;
  socket: string;
  /** The address the node advertises. */
  publicAddress: string;
  /** Where rtpengine says its media is: the public address, unless the fixture moved it. */
  advertise: string;
  /**
   * Present when the engine advertises an address other than the node's, which
   * only the TURN server can reach: the relay phase. Its range is what a relayed
   * pair's local port falls inside, a fact about the fixture rather than the
   * browser's label for the candidate.
   */
  relay?: { min: number; max: number };
  /**
   * A user of the node, for signing in to read `GET /client/config` from the
   * Node side; the page never holds the session. The password is generated per
   * run by `up.sh`, so there is no default, and only the relay phase needs it.
   */
  apiUser?: { username: string; password: string };
  realm: string;
  subscribers: [string, string];
  password: string;
  resultsDir: string;
}

export function fixtureFromEnvironment(env: NodeJS.ProcessEnv = process.env): Fixture {
  const apiPort = env.ATHENA_INTEROP_API_PORT ?? '8080';
  const wsPort = env.ATHENA_INTEROP_WS_PORT ?? '8088';
  const publicAddress = env.ATHENA_INTEROP_PUBLIC_ADDRESS ?? '127.0.0.1';
  const subscribers = (env.ATHENA_INTEROP_ACCOUNTS ?? '1001,1002').split(',').map((subscriber) => subscriber.trim()).filter(Boolean);
  if (subscribers.length !== 2) {
    throw new Error(`ATHENA_INTEROP_ACCOUNTS names ${subscribers.length} subscriber(s); a call needs exactly two`);
  }
  const advertise = env.ATHENA_INTEROP_RTPENGINE_ADVERTISE || publicAddress;
  let relay: Fixture['relay'];
  if (advertise !== publicAddress) {
    const min = Number(env.ATHENA_INTEROP_TURN_MIN);
    const max = Number(env.ATHENA_INTEROP_TURN_MAX);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new Error(`The engine advertises ${advertise}, which only TURN can reach, but ATHENA_INTEROP_TURN_MIN and _MAX do not give a relay range`);
    }
    relay = { min, max };
  }
  return {
    pageUrl: (env.ATHENA_INTEROP_PAGE_URL ?? `http://127.0.0.1:${apiPort}`).replace(/\/+$/, ''),
    apiUrl: `http://127.0.0.1:${apiPort}/api/v1`,
    socket: env.ATHENA_INTEROP_WS_URL ?? `ws://127.0.0.1:${wsPort}`,
    publicAddress,
    advertise,
    relay,
    apiUser: env.ATHENA_INTEROP_API_USER && env.ATHENA_INTEROP_API_PASSWORD
      ? { username: env.ATHENA_INTEROP_API_USER, password: env.ATHENA_INTEROP_API_PASSWORD }
      : undefined,
    realm: env.ATHENA_INTEROP_REALM ?? publicAddress,
    subscribers: [subscribers[0], subscribers[1]],
    password: env.ATHENA_INTEROP_PASSWORD ?? 'athenaphone',
    resultsDir: env.ATHENA_INTEROP_RESULTS ?? 'e2e/results',
  };
}

export function sipUri(fixture: Fixture, user: string): string {
  return `sip:${user}@${fixture.realm}`;
}

/** The softphone page, opened already knowing what to do. */
export function softphoneUrl(fixture: Fixture, user: string, options: { target?: string; answer?: boolean; ice?: unknown[] }): string {
  const url = new URL('/softphone.html', `${fixture.pageUrl}/`);
  url.searchParams.set('ws', fixture.socket);
  url.searchParams.set('uri', sipUri(fixture, user));
  url.searchParams.set('password', fixture.password);
  url.searchParams.set('register', '1');
  if (options.target) url.searchParams.set('target', options.target);
  if (options.answer) url.searchParams.set('answer', '1');
  if (options.ice) url.searchParams.set('ice', JSON.stringify(options.ice));
  if (fixture.relay) url.searchParams.set('relay', '1');
  return url.toString();
}
