import type { ClientConfig } from '../api/types';
import type { SoftphoneConfig } from '../softphone/Softphone';
import { signallingUris } from '../softphone/words';

/** How long registering with a WebSocket given waits for the node's configuration before going without it. */
export const CONFIG_WAIT_MS = 4000;

/**
 * How to register, from the realm's client configuration (RFC 5626, RFC 3261
 * 10.3): the WebSocket, the other nodes' to fail over to, the lifetime the
 * realm grants, and how many flows it wants kept.
 *
 * A WebSocket typed by the user wins. The other nodes are added only when it
 * is one of the cluster's own, since a socket elsewhere is not this cluster's
 * to fail over from. Undefined `socket` means the node offers none this page
 * can use.
 */
export function lineSettings(config: ClientConfig, https: boolean, chosen?: string): Omit<SoftphoneConfig, 'uri' | 'password' | 'socket'> & { socket?: string } {
  const uris = signallingUris(config, https);
  const socket = chosen || uris[0];
  const ours = !chosen || uris.includes(chosen);
  const fallbacks = ours ? uris.filter((uri) => uri !== socket) : [];
  const expires = config.realm?.registration?.expires;
  const flows = ours ? config.realm?.outbound?.flows ?? 1 : 1;
  return {
    socket,
    fallbacks,
    ...(expires && expires > 0 ? { expires } : {}),
    flows: Math.max(1, Math.min(flows, fallbacks.length + 1)),
  };
}
