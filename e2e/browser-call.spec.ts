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
  fixture: Omit<Fixture, 'password'>;
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
  await page.goto(softphoneUrl(fixture, user, options));
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
 * other, DTLS completed, and where the fixture advertises an address other
 * than loopback, that address is where each browser was sending: the engine
 * anchored the call, rather than declining it and letting the two ends reach
 * each other directly.
 */
async function mediaFlowed(caller: Page, callee: Page): Promise<void> {
  await caller.waitForTimeout(2000);
  for (const [name, page] of [['caller', caller], ['callee', callee]] as const) {
    const stats = await readStats(page);
    expect(stats, `${name} has no peer connection to read`).toBeDefined();
    expect(stats!.dtlsState, `${name} DTLS`).toBe('connected');
    expect(stats!.packetsSent, `${name} sent nothing`).toBeGreaterThan(0);
    expect(stats!.packetsReceived, `${name} received nothing`).toBeGreaterThan(0);
    expect(stats!.candidatePair, `${name} has no selected candidate pair`).toBeDefined();
    if (!fixture.publicAddress.startsWith('127.')) {
      expect(stats!.candidatePair!.remote.address, `${name} is not sending to the engine's advertised address`).toBe(fixture.publicAddress);
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
  const { password: _password, ...visible } = fixture;
  const record: Record_ = { test: title, fixture: visible, caller: await end(caller), callee: await end(callee) };
  await mkdir(fixture.resultsDir, { recursive: true });
  const file = join(fixture.resultsDir, `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`);
  await writeFile(file, JSON.stringify(record, null, 2));
}
