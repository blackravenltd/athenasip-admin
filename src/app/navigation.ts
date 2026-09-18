import { routes } from './routes';

export interface NavItem {
  to: string;
  label: string;
  /** Match this path exactly rather than as a prefix. Section roots do not. */
  end: boolean;
}

/** The top-level sections, in the order they appear in the bar. */
export const topNav: readonly NavItem[] = [
  { to: routes.home, label: 'Overview', end: true },
  { to: routes.sip, label: 'SIP', end: false },
  { to: routes.media, label: 'Media', end: false },
  { to: routes.security, label: 'Security', end: false },
  { to: routes.diagnostics, label: 'Diagnostics', end: false },
];

/**
 * The sub-navigation for a section, or nothing.
 *
 * Keyed by the section root and matched by prefix, so every path inside a
 * section keeps its section's bar. Returning `undefined` rather than an empty
 * array is what lets the shell leave the second row out entirely instead of
 * rendering an empty sticky strip.
 */
const sectionNavs: ReadonlyArray<{ prefix: string; ariaLabel: string; items: readonly NavItem[] }> = [
  {
    prefix: routes.sip,
    ariaLabel: 'SIP navigation',
    items: [
      { to: routes.realms, label: 'Realms', end: true },
      { to: routes.subscribers, label: 'Subscribers', end: true },
      { to: routes.registrations, label: 'Registrations', end: true },
    ],
  },
  {
    prefix: routes.media,
    ariaLabel: 'Media navigation',
    items: [
      { to: routes.media, label: 'Overview', end: true },
      { to: routes.rtpRelay, label: 'RTP Relay', end: true },
    ],
  },
  {
    prefix: routes.security,
    ariaLabel: 'Security navigation',
    items: [
      { to: routes.security, label: 'Overview', end: true },
      { to: routes.securityTls, label: 'TLS', end: true },
    ],
  },
  {
    prefix: routes.diagnostics,
    ariaLabel: 'Diagnostics navigation',
    items: [
      { to: routes.diagnostics, label: 'Overview', end: true },
      { to: routes.softphone, label: 'Softphone', end: true },
    ],
  },
];

export function sectionNavFor(pathname: string): { ariaLabel: string; items: readonly NavItem[] } | undefined {
  // A prefix match, but only on a path boundary: `/mediaserver` is not inside
  // `/media`, and a `startsWith` alone says it is.
  const found = sectionNavs.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return found && { ariaLabel: found.ariaLabel, items: found.items };
}
