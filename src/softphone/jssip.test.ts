import JsSIP from 'jssip';
import { describe, expect, it } from 'vitest';
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

describe('newInstanceId', () => {
  it('makes a version 4 UUID that JsSIP takes as an instance', () => {
    expect(newInstanceId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
