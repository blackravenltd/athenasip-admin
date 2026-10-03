/**
 * Every path this client knows, named once.
 *
 * Nothing constructs a path by string concatenation at a call site: a link and
 * the route it reaches have to be the same text, and the only way to guarantee
 * that is for them to be the same constant. The previous hand-rolled router
 * kept its route table in one file and its links in eight, which is how
 * `/sip` came to be in the navigation and absent from the table.
 */
export const routes = {
  home: '/',

  sip: '/sip',
  realms: '/sip/realms',
  subscribers: '/sip/subscribers',
  registrations: '/sip/registrations',

  calls: '/calls',

  media: '/media',

  security: '/security',
  securityTls: '/security/tls',

  users: '/users',
  account: '/account',

  settings: '/settings',

  diagnostics: '/diagnostics',
  softphone: '/diagnostics/softphone',
} as const;

/** The subscribers of one realm, which is the only path that carries a parameter. */
export function realmSubscribers(realm: string): string {
  return `${routes.subscribers}?realm=${encodeURIComponent(realm)}`;
}
