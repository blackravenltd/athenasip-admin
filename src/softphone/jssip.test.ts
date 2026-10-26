import JsSIP from 'jssip';
import { describe, expect, it, vi } from 'vitest';
import type { UA } from 'jssip/lib/UA';
import { jssipStack, useFlow } from './jssip';
import { newInstanceId } from './Softphone';

/** A real JsSIP user agent over a socket it never opens: it connects only on start. */
function agent(flow?: number) {
  const instance = '5f2c9a4e-1b3d-4c5e-8f60-718293a4b5c6';
  return jssipStack.createUserAgent({
    sockets: new JsSIP.WebSocketInterface('wss://node.invalid:8089'),
    uri: 'sip:1001@example.com',
    password: 'secret',
    instance_id: instance,
  }, flow);
}

const contact = (ua: UA) => (ua.registrator() as unknown as { _contact: string })._contact;

describe('the JsSIP stack', () => {
  it('registers the first flow as JsSIP does', () => {
    expect(contact(agent())).toContain(';reg-id=1;+sip.instance="<urn:uuid:5f2c9a4e-1b3d-4c5e-8f60-718293a4b5c6>"');
  });

  it('registers a second flow of the same instance with its own reg-id', () => {
    const second = agent(2);
    expect(contact(second)).toContain(';reg-id=2;+sip.instance="<urn:uuid:5f2c9a4e-1b3d-4c5e-8f60-718293a4b5c6>"');
    expect((second.registrator() as unknown as { _reg_id: number })._reg_id).toBe(2);
  });

  it('refuses rather than guess when the registrator is not as this JsSIP keeps it', () => {
    const odd = { registrator: () => ({ _reg_id: 1, _contact: '<sip:x@y>' }) } as unknown as UA;
    expect(() => useFlow(odd, 2)).toThrow('this JsSIP cannot keep more than one flow');
  });
});

/**
 * A socket JsSIP takes as its own, which connects on the next tick, as a
 * WebSocket does, and keeps what is sent: the REGISTER as it would go on the
 * wire, with no node to answer it.
 */
function capturingSocket() {
  const sent: string[] = [];
  const socket = {
    via_transport: 'WSS',
    url: 'wss://node.invalid:8089',
    sip_uri: 'sip:node.invalid:8089;transport=ws',
    connected: false,
    onconnect: () => undefined,
    ondisconnect: (_error: boolean) => undefined,
    ondata: (_data: string) => undefined,
    connect() { setTimeout(() => { this.connected = true; this.onconnect(); }, 0); },
    disconnect() { this.connected = false; },
    send(data: string) { sent.push(data); return true; },
    isConnected() { return this.connected; },
    isConnecting() { return false; },
  };
  return { socket, sent };
}

describe('a second flow on the wire', () => {
  it('registers with reg-id 2, the shared instance and Supported: outbound, which the registrar needs to keep both', async () => {
    const { socket, sent } = capturingSocket();
    const ua = jssipStack.createUserAgent({
      sockets: socket as never,
      uri: 'sip:1001@example.com',
      password: 'secret',
      instance_id: '5f2c9a4e-1b3d-4c5e-8f60-718293a4b5c6',
      register_expires: 3600,
    }, 2);
    ua.start();
    try {
      const register = await vi.waitFor(() => {
        const found = sent.find((message) => message.startsWith('REGISTER '));
        if (!found) throw new Error('no REGISTER yet');
        return found;
      });
      expect(register).toMatch(/^Contact: .*;reg-id=2;\+sip\.instance="<urn:uuid:5f2c9a4e-1b3d-4c5e-8f60-718293a4b5c6>"/m);
      expect(register).toMatch(/^Supported: .*\boutbound\b/m);
      expect(register).toMatch(/expires=3600|^Expires: 3600/m);
    } finally {
      ua.stop();
    }
  });
});

describe('newInstanceId', () => {
  it('makes a version 4 UUID that JsSIP takes as an instance', () => {
    expect(newInstanceId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
