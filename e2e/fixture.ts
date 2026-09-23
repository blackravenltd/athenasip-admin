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
  /** The address the node advertises, and where rtpengine says its media is. */
  publicAddress: string;
  realm: string;
  accounts: [string, string];
  password: string;
  resultsDir: string;
}

export function fixtureFromEnvironment(env: NodeJS.ProcessEnv = process.env): Fixture {
  const apiPort = env.ATHENA_INTEROP_API_PORT ?? '8080';
  const wsPort = env.ATHENA_INTEROP_WS_PORT ?? '8088';
  const publicAddress = env.ATHENA_INTEROP_PUBLIC_ADDRESS ?? '127.0.0.1';
  const accounts = (env.ATHENA_INTEROP_ACCOUNTS ?? '1001,1002').split(',').map((account) => account.trim()).filter(Boolean);
  if (accounts.length !== 2) {
    throw new Error(`ATHENA_INTEROP_ACCOUNTS names ${accounts.length} account(s); a call needs exactly two`);
  }
  return {
    pageUrl: (env.ATHENA_INTEROP_PAGE_URL ?? `http://127.0.0.1:${apiPort}`).replace(/\/+$/, ''),
    apiUrl: `http://127.0.0.1:${apiPort}/api/v1`,
    socket: env.ATHENA_INTEROP_WS_URL ?? `ws://127.0.0.1:${wsPort}`,
    publicAddress,
    realm: env.ATHENA_INTEROP_REALM ?? publicAddress,
    accounts: [accounts[0], accounts[1]],
    password: env.ATHENA_INTEROP_PASSWORD ?? 'athenaphone',
    resultsDir: env.ATHENA_INTEROP_RESULTS ?? 'e2e/results',
  };
}

export function sipUri(fixture: Fixture, user: string): string {
  return `sip:${user}@${fixture.realm}`;
}

/** The softphone page, opened already knowing what to do. */
export function softphoneUrl(fixture: Fixture, user: string, options: { target?: string; answer?: boolean }): string {
  const url = new URL('/softphone.html', `${fixture.pageUrl}/`);
  url.searchParams.set('ws', fixture.socket);
  url.searchParams.set('uri', sipUri(fixture, user));
  url.searchParams.set('password', fixture.password);
  url.searchParams.set('register', '1');
  if (options.target) url.searchParams.set('target', options.target);
  if (options.answer) url.searchParams.set('answer', '1');
  return url.toString();
}
