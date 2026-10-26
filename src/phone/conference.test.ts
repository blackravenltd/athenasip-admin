import { describe, expect, it } from 'vitest';
import { prefixOf, roomOf, roomUri } from './conference';

const ROOMS = [{ prefix: 'conf-', trunk: 'rooms' }, { prefix: 'meet.', trunk: 'sfu' }];
const REALM = 'sip.athenasip.org';

describe('prefixOf', () => {
  it('finds the prefix a room name starts with, but not a bare prefix', () => {
    expect(prefixOf('conf-sales', ROOMS)?.trunk).toBe('rooms');
    expect(prefixOf('meet.board', ROOMS)?.trunk).toBe('sfu');
    expect(prefixOf('conf-', ROOMS)).toBeUndefined();
    expect(prefixOf('tom', ROOMS)).toBeUndefined();
    expect(prefixOf('Conf-sales', ROOMS)).toBeUndefined();
  });
});

describe('roomUri', () => {
  it('puts a bare name under the chosen prefix in the line realm', () => {
    expect(roomUri(' sales ', 'conf-', REALM, ROOMS)).toBe('sip:conf-sales@sip.athenasip.org');
    expect(roomUri('board', 'meet.', REALM, ROOMS)).toBe('sip:meet.board@sip.athenasip.org');
  });

  it('does not double a prefix already typed, under either prefix', () => {
    expect(roomUri('conf-sales', 'conf-', REALM, ROOMS)).toBe('sip:conf-sales@sip.athenasip.org');
    expect(roomUri('meet.board', 'conf-', REALM, ROOMS)).toBe('sip:meet.board@sip.athenasip.org');
  });

  it('keeps a whole URI, adding the prefix only to a user part without one', () => {
    expect(roomUri('sip:conf-sales@sip.athenasip.org', 'conf-', REALM, ROOMS)).toBe('sip:conf-sales@sip.athenasip.org');
    expect(roomUri('conf-sales@sip.athenasip.org', 'conf-', REALM)).toBe('sip:conf-sales@sip.athenasip.org');
    expect(roomUri('sales@sip.athenasip.org', 'conf-', REALM)).toBe('sip:conf-sales@sip.athenasip.org');
  });

  it('has nothing to dial from nothing, or from a name with a space', () => {
    expect(roomUri('  ', 'conf-', REALM)).toBeUndefined();
    expect(roomUri('sales team', 'conf-', REALM)).toBeUndefined();
    expect(roomUri('sip:@sip.athenasip.org', 'conf-', REALM)).toBeUndefined();
  });
});

describe('roomOf', () => {
  it('recognises a room in the line realm, however it was dialled', () => {
    expect(roomOf('sip:conf-sales@sip.athenasip.org', ROOMS, REALM)).toEqual({ uri: 'sip:conf-sales@sip.athenasip.org', name: 'conf-sales', prefix: 'conf-' });
    expect(roomOf('sip:conf-sales@SIP.athenasip.org;transport=ws', ROOMS, REALM)?.name).toBe('conf-sales');
  });

  it('is not a room in another realm, under no prefix, or with no realm known', () => {
    expect(roomOf('sip:conf-sales@blackraven.co.nz', ROOMS, REALM)).toBeUndefined();
    expect(roomOf('sip:tom@sip.athenasip.org', ROOMS, REALM)).toBeUndefined();
    expect(roomOf('sip:conf-sales@sip.athenasip.org', [], REALM)).toBeUndefined();
    expect(roomOf('sip:conf-sales@sip.athenasip.org', ROOMS, undefined)).toBeUndefined();
    expect(roomOf(undefined, ROOMS, REALM)).toBeUndefined();
  });
});
