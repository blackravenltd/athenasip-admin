import { describe, expect, it } from 'vitest';
import { isRealmName, isSipUser } from './names';

describe('isRealmName', () => {
  it('takes host names and addresses, as the node does', () => {
    for (const name of ['sip.example.org', 'blackraven.co.nz', 'a', '10.35.1.123', 'x-1.example']) expect(isRealmName(name), name).toBe(true);
    for (const name of ['', 'sip..example', '-sip.example', 'sip-.example', 'sip.example.', 'sip_x.org', 'sip example', 'a'.repeat(64), `${'a.'.repeat(127)}a`]) {
      expect(isRealmName(name), name).toBe(false);
    }
  });
});

describe('isSipUser', () => {
  it('takes an RFC 3261 user part and nothing else', () => {
    for (const user of ['tom', '1001', '+6428255914', 'a.b_c-d', "o'neil", 'a%20b', 'x;y=z', 'a/b?c']) expect(isSipUser(user), user).toBe(true);
    for (const user of ['', 'a@b', 'a:b', 'a b', 'a%2', 'a%zz', 'tab\there', 'é']) expect(isSipUser(user), user).toBe(false);
  });
});
