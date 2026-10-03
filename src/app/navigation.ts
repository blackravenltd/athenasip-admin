import type { Role } from '../api/types';
import { can } from '../auth/roles';
import { routes } from './routes';

export interface NavItem {
  to: string;
  label: string;
  /** Match this path exactly rather than as a prefix. Section roots do not. */
  end: boolean;
  /** The roles, any of which lets a login use the screen. A login with none of them does not see the link. */
  requires?: readonly Role[];
}

/** The top-level sections, in the order they appear in the bar. */
export const topNav: readonly NavItem[] = [
  { to: routes.home, label: 'Overview', end: true },
  { to: routes.sip, label: 'SIP', end: false, requires: ['manage-realms', 'manage-realm-subscribers', 'view-cluster-status'] },
  { to: routes.calls, label: 'Calls', end: false, requires: ['view-cluster-status'] },
  { to: routes.media, label: 'Media', end: false, requires: ['manage-realms', 'view-cluster-status'] },
  { to: routes.security, label: 'Security', end: false, requires: ['view-cluster-status'] },
  { to: routes.users, label: 'Users', end: false, requires: ['manage-admin-users'] },
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
      { to: routes.realms, label: 'Realms', end: true, requires: ['manage-realms'] },
      { to: routes.subscribers, label: 'Subscribers', end: true, requires: ['manage-realm-subscribers'] },
      { to: routes.registrations, label: 'Registrations', end: true, requires: ['view-cluster-status'] },
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

export function sectionNavFor(pathname: string, roles?: readonly Role[]): { ariaLabel: string; items: readonly NavItem[] } | undefined {
  // A prefix match, but only on a path boundary: `/mediaserver` is not inside
  // `/media`, and a `startsWith` alone says it is.
  const found = sectionNavs.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return found && { ariaLabel: found.ariaLabel, items: visible(found.items, roles) };
}

/**
 * The items a login's roles let it use. With no roles given, all of them, which is
 * what a test of the navigation itself wants. Hiding rather than letting a
 * link click through to a 403 is the point: a console that offers what it
 * cannot do teaches its operator to ignore it.
 */
export function visible(items: readonly NavItem[], roles?: readonly Role[]): readonly NavItem[] {
  if (!roles) return items;
  return items.filter((item) => !item.requires || can(roles, ...item.requires));
}
