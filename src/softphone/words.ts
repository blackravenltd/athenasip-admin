import type { ClientConfig } from '../api/types';
import type { CallState, RegistrationState, VideoLine } from './Softphone';

/**
 * The softphone's states and negotiation in words, shared by the harness
 * view and the Phone section so the two never describe one thing two ways.
 */

const CALL_LABELS: Record<CallState, string> = {
  idle: 'Idle',
  calling: 'Calling...',
  ringing: 'Ringing...',
  incoming: 'Incoming call',
  connected: 'Connected',
  ended: 'Call ended',
  failed: 'Call failed',
};

const REGISTRATION_LABELS: Record<RegistrationState, string> = {
  unregistered: 'Not registered',
  connecting: 'Registering...',
  registered: 'Registered',
  failed: 'Registration failed',
};

export function describeCallState(state: CallState): string {
  return CALL_LABELS[state];
}

export function describeRegistration(state: RegistrationState): string {
  return REGISTRATION_LABELS[state];
}

/** Whether a call is in progress, in the sense of "there is something to hang up". */
export function callInProgress(state: CallState): boolean {
  return state === 'calling' || state === 'ringing' || state === 'incoming' || state === 'connected';
}

/**
 * Where to signal, from what the node advertises, for a page served over
 * https or not.
 *
 * An https page must use the secure WebSocket: a browser blocks `ws://` from
 * it as mixed content. A plain http page uses the plain one, because the
 * secure one works only once the browser trusts the node's certificate, and
 * a page reached over http is usually one that has not been asked to. Nothing
 * when the node offers nothing fit, so the caller keeps its guess.
 */
export function signallingUri(config: ClientConfig, https: boolean): string | undefined {
  if (https) return config.websocket_uri;
  const plain = config.transports.find((entry) => entry.transport === 'ws');
  return plain ? `ws://${plain.address}:${plain.port}` : undefined;
}

/**
 * One end's video m-line, in words. Port 9, the discard port, is what a
 * bundled section carries when its address comes from ICE and the bundle's
 * transport, so it is named as bundled rather than shown as a port.
 */
export function describeVideoLine(line: VideoLine | undefined): string {
  if (!line) return 'none';
  if (line.port === 0) return 'declined (port 0)';
  if (line.bundled && line.port === 9) return `bundled, ${line.direction}`;
  return `port ${line.port}${line.bundled ? ' (bundled)' : ''}, ${line.direction}`;
}
