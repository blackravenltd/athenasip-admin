import type { AdminApi } from './AdminApi';
import { ApiError } from './errors';
import type { BusEvent } from './types';

/** `live` once the node accepted the stream; `down` while it is being retried; `off` when the node refused it for good. */
export type FeedState = 'connecting' | 'live' | 'down' | 'off';

type Listener = (event: BusEvent) => void;

/** The node's own `retry:`. */
export const RECONNECT_MS = 5000;
/** A node at its limit of streams is asked again after this, with polling in between. */
export const BUSY_RETRY_MS = 60_000;

/**
 * One `GET /events` stream per console, shared by every screen that listens:
 * a node serves at most 32, so a tab must not open one per screen. Opened
 * with the first listener, closed with the last, and reopened after a drop.
 *
 * A screen that listens keeps polling while the feed is not `live`, so the
 * stream is a speed-up, never a dependency.
 */
export class EventFeed {
  private listeners = new Set<Listener>();
  private stateListeners = new Set<(state: FeedState) => void>();
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private current: FeedState = 'down';

  constructor(private readonly api: AdminApi) {}

  get state(): FeedState {
    return this.current;
  }

  /** Hears every event until the returned function is called. */
  listen(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.open();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.close();
    };
  }

  watch(listener: (state: FeedState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private set(state: FeedState): void {
    if (state === this.current) return;
    this.current = state;
    for (const listener of [...this.stateListeners]) listener(state);
  }

  private open(): void {
    clearTimeout(this.timer);
    const controller = new AbortController();
    this.controller = controller;
    this.set('connecting');
    const deliver = (event: BusEvent) => { for (const listener of [...this.listeners]) listener(event); };
    void this.api.events(deliver, controller.signal, () => this.set('live')).then(
      () => this.retry(controller, RECONNECT_MS),
      (cause: unknown) => {
        // A missing role or a signed-out session is not cured by asking again.
        if (cause instanceof ApiError && (cause.isForbidden || cause.isUnauthorized || cause.status === 404)) {
          if (this.controller === controller) this.set('off');
          return;
        }
        this.retry(controller, cause instanceof ApiError && (cause.status === 503 || cause.status === 429) ? BUSY_RETRY_MS : RECONNECT_MS);
      },
    );
  }

  private retry(controller: AbortController, after: number): void {
    if (this.controller !== controller || controller.signal.aborted) return;
    this.set('down');
    this.timer = setTimeout(() => { if (this.listeners.size > 0) this.open(); }, after);
  }

  private close(): void {
    clearTimeout(this.timer);
    this.controller?.abort();
    this.controller = undefined;
    this.set('down');
  }
}

const feeds = new WeakMap<AdminApi, EventFeed>();

/** The one feed for this API. */
export function feedFor(api: AdminApi): EventFeed {
  let feed = feeds.get(api);
  if (!feed) {
    feed = new EventFeed(api);
    feeds.set(api, feed);
  }
  return feed;
}

/** Whether a topic is one of `prefixes` or below one: `calls/` takes `calls/x/state`. */
export function topicMatches(topic: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => topic === prefix || topic.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
}
