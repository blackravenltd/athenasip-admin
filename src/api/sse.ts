import type { BusEvent } from './types';

/**
 * A `text/event-stream` parser (the HTML standard's "Server-sent events",
 * 9.2.6), fed text as it arrives. The node's `/events` names each event by
 * its bus topic and sends the message as its data. `EventSource` cannot carry
 * a bearer token, which is why the stream is read by hand.
 */
export class EventStreamParser {
  private buffer = '';
  private event = '';
  private data: string[] = [];

  constructor(private readonly onEvent: (event: BusEvent) => void) {}

  /** Takes the next piece of the stream, which may end mid-line. */
  push(text: string): void {
    this.buffer += text;
    for (;;) {
      const end = this.buffer.search(/\r\n|\r|\n/);
      if (end < 0) return;
      // A lone CR at the end of a piece may be the first half of CRLF.
      if (this.buffer[end] === '\r' && end === this.buffer.length - 1) return;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + (this.buffer.startsWith('\r\n', end) ? 2 : 1));
      this.line(line);
    }
  }

  private line(line: string): void {
    if (line === '') {
      this.dispatch();
      return;
    }
    // A comment, such as the node's keep-alive.
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.event = value;
    else if (field === 'data') this.data.push(value);
    // `retry` and `id` mean nothing here: the caller decides when to reconnect.
  }

  private dispatch(): void {
    const topic = this.event;
    const text = this.data.join('\n');
    const had = this.data.length > 0;
    this.event = '';
    this.data = [];
    if (!had || !topic) return;
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* Plain text, such as a Call-ID. */ }
    this.onEvent({ topic, data });
  }
}
