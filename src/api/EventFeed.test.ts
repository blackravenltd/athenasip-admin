import { describe, expect, it, vi } from 'vitest';
import { EventFeed, RECONNECT_MS, topicMatches } from './EventFeed';
import { FakeAdminApi } from './FakeAdminApi';
import { ApiError } from './errors';
import type { AdminApi } from './AdminApi';
import type { BusEvent } from './types';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('EventFeed', () => {
  it('opens one stream for every listener and closes it with the last', async () => {
    const api = new FakeAdminApi();
    const feed = new EventFeed(api);
    const first: BusEvent[] = [];
    const second: BusEvent[] = [];
    const stopFirst = feed.listen((event) => first.push(event));
    const stopSecond = feed.listen((event) => second.push(event));
    await tick();
    expect(api.eventListeners).toBe(1);
    expect(feed.state).toBe('live');
    api.publishElsewhere('calls/x/state', 'Ringing');
    expect(first.at(-1)).toEqual({ topic: 'calls/x/state', data: 'Ringing' });
    expect(second.at(-1)).toEqual({ topic: 'calls/x/state', data: 'Ringing' });
    stopFirst();
    expect(api.eventListeners).toBe(1);
    stopSecond();
    await tick();
    expect(api.eventListeners).toBe(0);
  });

  it('gives up on a missing role rather than asking again', async () => {
    const events = vi.fn(async () => { throw new ApiError('forbidden', 403, 'forbidden'); });
    const feed = new EventFeed({ events } as unknown as AdminApi);
    feed.listen(() => undefined);
    await tick();
    expect(feed.state).toBe('off');
    expect(events).toHaveBeenCalledOnce();
  });

  it('reconnects after a drop', async () => {
    vi.useFakeTimers();
    try {
      const events = vi.fn(async () => { throw new TypeError('network'); });
      const feed = new EventFeed({ events } as unknown as AdminApi);
      feed.listen(() => undefined);
      await vi.advanceTimersByTimeAsync(0);
      expect(feed.state).toBe('down');
      await vi.advanceTimersByTimeAsync(RECONNECT_MS);
      expect(events).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('topicMatches', () => {
  it('matches a topic below a prefix, on a level boundary', () => {
    expect(topicMatches('calls/a@b/state', ['calls'])).toBe(true);
    expect(topicMatches('callsx/a', ['calls'])).toBe(false);
    expect(topicMatches('trunks/changed', ['nodes', 'trunks/'])).toBe(true);
  });
});
