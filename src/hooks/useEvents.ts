import { useEffect, useRef, useState } from 'react';
import type { AdminApi } from '../api/AdminApi';
import { feedFor, topicMatches, type FeedState } from '../api/EventFeed';
import type { BusEvent } from '../api/types';

/** Events closer together than this make one refresh: a call's setup publishes several. */
export const SETTLE_MS = 250;

/**
 * Calls `onEvent` for each bus event under `prefixes` while mounted and
 * `enabled`, through the console's one shared stream. Returns whether the
 * stream is live, so a screen can poll while it is not.
 */
export function useEvents(api: AdminApi, prefixes: readonly string[], onEvent: (event: BusEvent) => void, enabled = true): boolean {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const key = prefixes.join('\n');
  const [state, setState] = useState<FeedState>('down');

  useEffect(() => {
    if (!enabled) {
      setState('down');
      return undefined;
    }
    const feed = feedFor(api);
    const wanted = key.split('\n');
    const unwatch = feed.watch(setState);
    const unlisten = feed.listen((event) => { if (topicMatches(event.topic, wanted)) onEventRef.current(event); });
    setState(feed.state);
    return () => { unlisten(); unwatch(); };
  }, [api, key, enabled]);

  return enabled && state === 'live';
}

/**
 * Runs `refresh` once after a burst of events under `prefixes` settles.
 * Returns whether the stream is live.
 */
export function useEventRefresh(api: AdminApi, prefixes: readonly string[], refresh: () => void, enabled = true): boolean {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => () => clearTimeout(timer.current), []);
  return useEvents(api, prefixes, () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => refreshRef.current(), SETTLE_MS);
  }, enabled);
}
