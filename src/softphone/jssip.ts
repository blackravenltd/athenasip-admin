/** The real JsSIP behind `SipStack`. Only this module imports the library. */
import JsSIP from 'jssip';
import type { UA } from 'jssip/lib/UA';
import type { SipStack } from './Softphone';

/** The parts of JsSIP's registrator that carry the RFC 5626 `reg-id`, which it fixes at 1. */
interface RegistratorInternals {
  _reg_id?: unknown;
  _contact?: unknown;
}

/**
 * Makes `agent` register as flow `flow` of its instance. JsSIP always says
 * `reg-id=1`, so a second flow would replace the first at the registrar
 * rather than sit beside it. Its registrator is changed before it starts;
 * when the fields are not where this JsSIP keeps them, it throws, and the
 * phone keeps one flow.
 */
export function useFlow(agent: UA, flow: number): void {
  const registrator = agent.registrator() as unknown as RegistratorInternals;
  const contact = registrator._contact;
  if (registrator._reg_id !== 1 || typeof contact !== 'string' || !contact.includes(';reg-id=1;')) {
    throw new Error('this JsSIP cannot keep more than one flow');
  }
  registrator._reg_id = flow;
  registrator._contact = contact.replace(';reg-id=1;', `;reg-id=${flow};`);
}

export const jssipStack: SipStack = {
  createUserAgent: (configuration, flow = 1) => {
    const agent = new JsSIP.UA(configuration);
    if (flow > 1) useFlow(agent, flow);
    return agent;
  },
  createSocket: (url) => new JsSIP.WebSocketInterface(url),
};
