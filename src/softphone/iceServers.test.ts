import { describe, expect, it } from 'vitest';
import { usableIceServers } from './iceServers';

describe('usableIceServers', () => {
  const now = 1_790_000_000_000;

  it('passes STUN through and TURN with its credential, without the expiry', () => {
    expect(usableIceServers([
      { urls: 'stun:host:3478' },
      { urls: 'turn:host:3478', username: '1790003600:tom', credential: 'c2VjcmV0', expires_at: 1_790_003_600 },
    ], now)).toEqual([
      { urls: 'stun:host:3478' },
      { urls: 'turn:host:3478', username: '1790003600:tom', credential: 'c2VjcmV0' },
    ]);
  });

  it('drops a TURN entry the node could mint no credential for', () => {
    expect(usableIceServers([{ urls: 'turn:host:3478' }, { urls: 'turns:host:5349', username: 'u' }], now)).toEqual([]);
  });

  it('drops a TURN credential that has already expired', () => {
    expect(usableIceServers([{ urls: 'turn:host:3478', username: 'u', credential: 'c', expires_at: 1_790_000_000 }], now)).toEqual([]);
  });
});
