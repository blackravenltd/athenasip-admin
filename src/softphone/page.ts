/**
 * The page-level contract for driving the softphone from outside.
 *
 * Two things live here. The query string a harness opens the page with, so a
 * browser can arrive already knowing which node to register against and what
 * to do when it gets there. And the readout the page hangs on `window`, so a
 * test can read the state, the descriptions and the counters rather than
 * scrape them off the screen.
 *
 * Both are for the AthenaSIP end-to-end run, and both are documented in
 * `docs/softphone.md`. Nothing here is loaded by the provisioning screens.
 */
import type { IceServer } from '../api/types';
import type { MediaStats, Softphone, SoftphoneState, Transition } from './Softphone';

export interface PageOptions {
  socket?: string;
  uri?: string;
  password?: string;
  target?: string;
  /** Register as soon as the page loads, rather than waiting for the button. */
  register: boolean;
  /** Answer an incoming call as soon as it arrives. */
  answer: boolean;
  /**
   * ICE servers, as `GET /client/config` gives them. The harness fetches them
   * itself, where its token already is, so this page never holds one.
   */
  ice?: IceServer[];
  /** Media only through the TURN server, `iceTransportPolicy: "relay"`. */
  relay?: boolean;
}

/**
 * The options a page was opened with.
 *
 * `ws`, `uri`, `password` and `target` prefill the fields; `register=1`
 * presses Register, and `answer=1` presses Answer when a call arrives. `ice`
 * is a JSON array of ICE servers and `relay=1` forces media through TURN. A
 * password or a TURN credential in a URL is a harness convenience and nothing
 * else; the page removes both from the address bar as soon as it has read them.
 */
export function pageOptions(search: string): PageOptions {
  const params = new URLSearchParams(search);
  const text = (key: string) => {
    const value = params.get(key);
    return value === null || value === '' ? undefined : value;
  };
  const flag = (key: string) => {
    const value = params.get(key);
    return value === '1' || value === 'true';
  };
  return {
    socket: text('ws'),
    uri: text('uri'),
    password: text('password'),
    target: text('target'),
    register: flag('register'),
    answer: flag('answer'),
    ice: iceServers(text('ice')),
    relay: flag('relay'),
  };
}

/** Only entries with a string `urls` survive; anything that is not a JSON array is no servers at all. */
function iceServers(json: string | undefined): IceServer[] | undefined {
  if (json === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  return parsed.filter((entry): entry is IceServer => typeof entry === 'object' && entry !== null && typeof (entry as IceServer).urls === 'string');
}

/** The URL with the password and the ICE servers removed, or `undefined` when there was neither. */
export function withoutSecrets(url: string): string | undefined {
  const parsed = new URL(url);
  const secrets = ['password', 'ice'].filter((key) => parsed.searchParams.has(key));
  if (secrets.length === 0) return undefined;
  for (const key of secrets) parsed.searchParams.delete(key);
  return parsed.toString();
}

/** What a harness can read from `window.__athenaSoftphone`. */
export interface SoftphoneReadout {
  /** The contract's version, bumped when a field changes meaning. */
  readonly version: 1;
  state(): SoftphoneState;
  history(): readonly Transition[];
  stats(): Promise<MediaStats | undefined>;
  call(target: string): void;
  answer(): void;
  hangUp(): void;
}

export const READOUT_KEY = '__athenaSoftphone';

declare global {
  interface Window {
    [READOUT_KEY]?: SoftphoneReadout;
  }
}

/** Hangs the readout on the window, and returns the function that takes it down. */
export function expose(target: Window, phone: Softphone): () => void {
  const readout: SoftphoneReadout = {
    version: 1,
    state: () => phone.state,
    history: () => phone.history,
    stats: () => phone.stats(),
    call: (destination) => phone.call(destination),
    answer: () => phone.answer(),
    hangUp: () => phone.hangUp(),
  };
  target[READOUT_KEY] = readout;
  return () => {
    if (target[READOUT_KEY] === readout) delete target[READOUT_KEY];
  };
}
