import type { ConferencePrefix } from '../api/types';

/**
 * Conference rooms (RFC 4579), as the phone sees them.
 *
 * A room is a URI in the realm whose user part starts with one of the realm's
 * prefixes, such as `sip:conf-sales@example.com`. The node routes a call to
 * one to the focus trunk, which mixes the media, so joining a room is one
 * ordinary call. These helpers only build and recognise those URIs.
 */

/** A call's target recognised as a room. */
export interface Room {
  /** The conference URI as dialled. */
  uri: string;
  /** The user part, prefix included: `conf-sales`. */
  name: string;
  prefix: string;
}

/** The prefix `user` starts with, when it names a room under it and is not the bare prefix. */
export function prefixOf(user: string, prefixes: readonly ConferencePrefix[]): ConferencePrefix | undefined {
  return prefixes.find((entry) => entry.prefix && user.startsWith(entry.prefix) && user.length > entry.prefix.length);
}

/**
 * The room URI to dial for what was typed in the room field. A bare name gets
 * `prefix` and the line's realm; a name that already starts with one of the
 * realm's prefixes, or a whole URI, is not prefixed again. Undefined for
 * nothing, or for something with spaces in it, which no SIP URI has.
 */
export function roomUri(typed: string, prefix: string, realm: string, prefixes: readonly ConferencePrefix[] = []): string | undefined {
  const text = typed.trim().replace(/^sips?:/i, '');
  if (!text || /[\s<>]/.test(text)) return undefined;
  const at = text.indexOf('@');
  const user = at >= 0 ? text.slice(0, at) : text;
  const host = at >= 0 ? text.slice(at + 1) : realm;
  if (!user || !host) return undefined;
  const known = [...prefixes, { prefix, trunk: '' }];
  return `sip:${prefixOf(user, known) ? user : prefix + user}@${host}`;
}

/**
 * The room a call's target is, when it is one: its host is the line's realm
 * and its user part starts with one of that realm's prefixes. Whether it was
 * joined from the Conferences panel or dialled by hand makes no difference.
 */
export function roomOf(target: string | undefined, prefixes: readonly ConferencePrefix[], realm: string | undefined): Room | undefined {
  if (!target || !realm) return undefined;
  const match = /^sips?:([^@;>?]+)@([^:;>?]+)/i.exec(target.trim());
  if (!match || match[2].toLowerCase() !== realm.toLowerCase()) return undefined;
  const found = prefixOf(match[1], prefixes);
  return found ? { uri: target.trim(), name: match[1], prefix: found.prefix } : undefined;
}
