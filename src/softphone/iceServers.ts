import type { IceServer } from '../api/types';

/**
 * The node's `ice_servers`, as `RTCPeerConnection` should be given them.
 *
 * A `turn:` or `turns:` entry with no credential is a node with a TURN server
 * configured and no shared secret: the URL is reported because the operator
 * configured it, but the browser cannot use it, so it is dropped rather than
 * handed over half-built. So is one whose credential has already expired.
 * `expires_at` is ours, not WebRTC's, and is not passed on.
 */
export function usableIceServers(servers: readonly IceServer[], now: number = Date.now()): RTCIceServer[] {
  const usable: RTCIceServer[] = [];
  for (const { urls, username, credential, expires_at: expiresAt } of servers) {
    if (/^turns?:/i.test(urls)) {
      if (!username || !credential) continue;
      if (expiresAt !== undefined && expiresAt * 1000 <= now) continue;
      usable.push({ urls, username, credential });
    } else {
      usable.push({ urls });
    }
  }
  return usable;
}
