import { describe, expect, it } from 'vitest';
import { EventStreamParser } from './sse';
import type { BusEvent } from './types';

function parse(...pieces: string[]): BusEvent[] {
  const seen: BusEvent[] = [];
  const parser = new EventStreamParser((event) => seen.push(event));
  for (const piece of pieces) parser.push(piece);
  return seen;
}

describe('EventStreamParser', () => {
  it('names each event by its topic and parses JSON data', () => {
    expect(parse('retry: 5000\n\nevent: calls/a@b/state\ndata: {"state":"answered"}\n\n')).toEqual([
      { topic: 'calls/a@b/state', data: { state: 'answered' } },
    ]);
  });

  it('keeps data that is not JSON as text, such as a Call-ID', () => {
    expect(parse('event: calls/a@b/unregister\ndata: a@b\n\n')).toEqual([{ topic: 'calls/a@b/unregister', data: 'a@b' }]);
  });

  it('joins an event split across pieces, even between CR and LF', () => {
    expect(parse('event: trunks/ch', 'anged\r', '\ndata: acme\r\n', '\r\n')).toEqual([{ topic: 'trunks/changed', data: 'acme' }]);
  });

  it('ignores the keep-alive comment and an event with no data', () => {
    expect(parse(': keep-alive\n\nevent: nodes/x/status\n\n')).toEqual([]);
  });

  it('joins several data lines with a newline', () => {
    expect(parse('event: t\ndata: one\ndata: two\n\n')).toEqual([{ topic: 't', data: 'one\ntwo' }]);
  });
});
