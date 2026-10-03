import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { fixtureFromEnvironment, sipUri, softphoneUrl, type Fixture } from './fixture';
import type { MediaStats, SoftphoneState, Transition } from '../src/softphone/Softphone';
import type { SoftphoneReadout } from '../src/softphone/page';

/**
 * A browser calls a browser through AthenaSIP and rtpengine.
 *
 * This is the first "To the first call" item in the server's Milestone 3:
 * two browsers through rtpengine exercise everything on the node's side of a
 * browser calling an AthenaPhone, and run with no device and no phone at all.
 * The node's harness asserts on rtpengine's counters afterwards; this asserts
 * on the browsers' own, so the engine and the endpoints are two witnesses to
 * the same media.
 *
 * Nothing here sleeps for a state. Every wait is a predicate over the page's
 * readout, and the only fixed pause is the two seconds media is given to flow
 * before its counters are read.
 */

declare global {
  interface Window { __athenaSoftphone?: SoftphoneReadout }
}

interface Record_ {
  test: string;
  fixture: Omit<Fixture, 'password' | 'apiUser'>;
  caller: EndRecord;
  callee: EndRecord;
}

interface EndRecord {
  user: string;
  state: SoftphoneState;
  history: readonly Transition[];
  stats?: MediaStats;
}

const fixture = fixtureFromEnvironment();

/** In the relay phase, what `/client/config` says, fetched here so the page never holds a session. */
let iceServers: unknown[] | undefined;

test.beforeAll(async () => {
  let health: Response | undefined;
  try {
    health = await fetch(`${fixture.apiUrl}/health`);
  } catch {
    // Reported below.
  }
  if (!health?.ok) {
    throw new Error(
      `No AthenaSIP node is serving at ${fixture.apiUrl}. Bring the interop fixture up first: `
      + `(cd ../athenasip && test/interop/up.sh --rtpengine), and build this client so the node has a page to serve.`,
    );
  }
  if (fixture.relay) {
    if (!fixture.apiUser) {
      throw new Error('The relay phase reads /client/config as a user, and ATHENA_INTEROP_API_USER and ATHENA_INTEROP_API_PASSWORD are not set. up.sh writes both into generated/fixture.env.');
    }
    const login = await fetch(`${fixture.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fixture.apiUser),
    });
    expect(login.ok, `POST /auth/login as ${fixture.apiUser.username} answered ${login.status}`).toBe(true);
    const { token } = await login.json() as { token: string };
    const authorization = { Authorization: `Bearer ${token}` };
    const response = await fetch(`${fixture.apiUrl}/client/config`, { headers: authorization });
    expect(response.ok, `GET /client/config answered ${response.status}`).toBe(true);
    const config = await response.json() as { ice_servers?: Array<{ urls: string; credential?: string }> };
    // The session was only for this; leaving it open would outlive the run on the node.
    await fetch(`${fixture.apiUrl}/auth/logout`, { method: 'POST', headers: authorization }).catch(() => undefined);
    iceServers = config.ice_servers ?? [];
    expect(iceServers.some((server) => /^turns?:/.test((server as { urls: string }).urls) && (server as { credential?: string }).credential), 'the node offers no TURN server with a credential').toBe(true);
  }
});

test('the first account calls the second, and the caller hangs up', async ({ browser }, info) => {
  const [callerUser, calleeUser] = fixture.accounts;
  const callee = await open(browser, calleeUser, { answer: true });
  const caller = await open(browser, callerUser, { target: sipUri(fixture, calleeUser) });

  await caller.page.getByTestId('softphone-call').click();
  await connected(caller.page);
  await connected(callee.page);

  await mediaFlowed(caller.page, callee.page);
  await writeRecord(info.title, caller, callee);

  await caller.page.getByTestId('softphone-hangup').click();
  await ended(caller.page);
  await ended(callee.page);
});

test('the second account calls the first, and the callee hangs up', async ({ browser }, info) => {
  const [calleeUser, callerUser] = fixture.accounts;
  const callee = await open(browser, calleeUser, {});
  const caller = await open(browser, callerUser, { target: sipUri(fixture, calleeUser) });

  await caller.page.evaluate((target) => window.__athenaSoftphone!.call(target), sipUri(fixture, calleeUser));
  await callee.page.waitForFunction(() => window.__athenaSoftphone?.state().call === 'incoming');
  await callee.page.getByTestId('softphone-answer').click();
  await connected(caller.page);
  await connected(callee.page);

  await mediaFlowed(caller.page, callee.page);
  await writeRecord(info.title, caller, callee);

  await callee.page.getByTestId('softphone-hangup').click();
  await ended(callee.page);
  await ended(caller.page);
});

interface End {
  user: string;
  page: Page;
}

/** A registered softphone in a context of its own, so the two share no socket and no media stream. */
async function open(browser: Parameters<Parameters<typeof test>[2]>[0]['browser'], user: string, options: { target?: string; answer?: boolean }): Promise<End> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (error) => { throw error; });
  await page.goto(softphoneUrl(fixture, user, { ...options, ice: iceServers }));
  await page.waitForFunction(() => {
    const state = window.__athenaSoftphone?.state();
    return state?.registration === 'registered' || state?.registration === 'failed';
  });
  const state = await readState(page);
  expect(state.registration, `${user}: ${state.notice ?? 'registration failed'}`).toBe('registered');
  return { user, page };
}

async function connected(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const state = window.__athenaSoftphone?.state();
    return state?.call === 'connected' || state?.call === 'failed';
  });
  const state = await readState(page);
  expect(state.call, state.notice ?? state.cause ?? 'call failed').toBe('connected');
  await page.waitForFunction(() => {
    const ice = window.__athenaSoftphone?.state().iceConnectionState;
    return ice === 'connected' || ice === 'completed';
  });
}

async function ended(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__athenaSoftphone?.state().call === 'ended');
}

/**
 * The media assertion. Packets went out of each browser and came into the
 * other, what came in carried sound rather than silence, DTLS completed, and
 * where the engine advertises an address other than loopback, that address
 * is where each browser was sending: the engine anchored the call, rather
 * than declining it and letting the two ends reach each other directly. In
 * the relay phase the local end of the pair is a port in the TURN server's
 * relay range, which is how a relayed pair is known: the browser's own label
 * for it is not trusted, since Chrome reports it `prflx` once checks run.
 */
async function mediaFlowed(caller: Page, callee: Page): Promise<void> {
  await caller.waitForTimeout(2000);
  for (const [name, page] of [['caller', caller], ['callee', callee]] as const) {
    const stats = await readStats(page);
    expect(stats, `${name} has no peer connection to read`).toBeDefined();
    expect(stats!.dtlsState, `${name} DTLS`).toBe('connected');
    expect(stats!.packetsSent, `${name} sent nothing`).toBeGreaterThan(0);
    expect(stats!.packetsReceived, `${name} received nothing`).toBeGreaterThan(0);
    // Energy, not the instantaneous level: the fake device beeps, and an
    // instant can land in the gap between beeps.
    expect(stats!.totalAudioEnergy ?? 0, `${name} received only silence`).toBeGreaterThan(0);
    expect(stats!.candidatePair, `${name} has no selected candidate pair`).toBeDefined();
    if (!fixture.advertise.startsWith('127.')) {
      expect(stats!.candidatePair!.remote.address, `${name} is not sending to the engine's advertised address`).toBe(fixture.advertise);
    }
    if (fixture.relay) {
      const port = stats!.candidatePair!.local.port;
      expect(port >= fixture.relay.min && port <= fixture.relay.max, `${name} sent from port ${port}, outside the relay range ${fixture.relay.min}-${fixture.relay.max}`).toBe(true);
    }
  }
}

function readState(page: Page): Promise<SoftphoneState> {
  return page.evaluate(() => window.__athenaSoftphone!.state());
}

function readStats(page: Page): Promise<MediaStats | undefined> {
  return page.evaluate(() => window.__athenaSoftphone!.stats());
}

/** What happened, written down: both descriptions, the state history and the counters from each end. */
async function writeRecord(title: string, caller: End, callee: End): Promise<void> {
  const end = async (side: End): Promise<EndRecord> => ({
    user: side.user,
    state: await readState(side.page),
    history: await side.page.evaluate(() => window.__athenaSoftphone!.history()),
    stats: await readStats(side.page),
  });
  const { password: _password, apiUser: _apiUser, ...visible } = fixture;
  const record: Record_ = { test: title, fixture: visible, caller: await end(caller), callee: await end(callee) };
  await mkdir(fixture.resultsDir, { recursive: true });
  const file = join(fixture.resultsDir, `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`);
  await writeFile(file, JSON.stringify(record, null, 2));
}
