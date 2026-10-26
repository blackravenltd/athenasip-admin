/**
 * The node's rules for what a realm and a subscriber are called, so every
 * identity built on them parses. The node refuses anything else with a 400.
 */

/** A host name: dot-separated labels of letters, digits and inner hyphens. */
export function isRealmName(name: string): boolean {
  if (!name || name.length > 253) return false;
  return name.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}

/** An RFC 3261 user part (25.1): unreserved, user-unreserved and escaped characters only. */
export function isSipUser(user: string): boolean {
  return /^(?:[A-Za-z0-9\-_.!~*'()&=+$,;?/]|%[0-9A-Fa-f]{2})+$/.test(user);
}

export const REALM_NAME_RULE = 'A realm is a host name: letters, digits, hyphens and dots, such as sip.example.org.';
export const SIP_USER_RULE = 'A user cannot hold @, a colon, a space, or a % not followed by two hex digits.';
