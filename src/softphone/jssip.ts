/**
 * The real JsSIP, behind the `SipStack` seam.
 *
 * This is the only module that imports JsSIP, so it is the only one that
 * pulls the library into a bundle, and a test of the controller never loads
 * it at all.
 */
import JsSIP from 'jssip';
import type { SipStack } from './Softphone';

export const jssipStack: SipStack = {
  createUserAgent: (configuration) => new JsSIP.UA(configuration),
  createSocket: (url) => new JsSIP.WebSocketInterface(url),
};
