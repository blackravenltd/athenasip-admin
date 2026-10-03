import type { Role, SessionInfo } from '../api/types';
import { ROLES } from '../api/types';

/**
 * The roles as a person reads them, from the server's `docs/authentication.md`.
 *
 * There is no superuser and nothing implies anything else, so the console
 * never infers one role from another. It shows what the roles permit and
 * hides the rest; the node's 403 is the rule, and the hiding a courtesy.
 * A user is somebody who can use the API; a subscriber is something
 * registered on a realm to make and receive calls.
 */
export const ROLE_TEXT: Record<Role, { label: string; detail: string }> = {
  'view-cluster-status': {
    label: 'View cluster status',
    detail: 'Read the node, its transports and who is registered. Changes nothing.',
  },
  'manage-realms': {
    label: 'Manage realms',
    detail: 'Create, change and remove realms, with their registration and media policy.',
  },
  'manage-realm-subscribers': {
    label: 'Manage subscribers',
    detail: 'Create, change and remove the subscribers in a realm.',
  },
  'manage-admin-users': {
    label: 'Manage users',
    detail: 'Create, change and remove the users who can sign in here, and their roles. A user with this can give themselves every other role.',
  },
  'manage-cluster': {
    label: 'Manage cluster',
    detail: 'Change node membership and node configuration. Nothing in this console uses it yet.',
  },
};

/** Whether any of `needed` is held. */
export function can(roles: readonly Role[], ...needed: Role[]): boolean {
  return needed.some((role) => roles.includes(role));
}

/** The roles in words, in the order the console lists them. */
export function describeRoles(roles: readonly Role[]): string {
  return ROLES.filter((role) => roles.includes(role)).map((role) => ROLE_TEXT[role].label).join(', ');
}

/** Who is signed in, in words. */
export function describeWho(info: SessionInfo): string {
  return info.display_name || info.username || 'Signed in';
}
