/**
 * What to call, from what was typed: a SIP URI as it is, a bare `user@host`
 * given its scheme, and a bare number or name placed in this phone's own
 * realm, which is how a desk phone dials an extension.
 */
export function dialTarget(typed: string, ownUri: string): string | undefined {
  const text = typed.trim();
  if (!text) return undefined;
  if (/^sips?:/i.test(text)) return text;
  if (text.includes('@')) return `sip:${text}`;
  const realm = /@([^;>?]+)/.exec(ownUri)?.[1];
  return realm ? `sip:${text}@${realm}` : undefined;
}

/** The user part of a SIP URI, for a person to read; the whole thing when it has none. */
export function userOf(uri: string | null | undefined): string {
  if (!uri) return 'unknown';
  return /^sips?:([^@;>]+)@/i.exec(uri)?.[1] ?? uri.replace(/^sips?:/i, '');
}

/** A call's running time as m:ss, or h:mm:ss past the hour. */
export function callTimer(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}
