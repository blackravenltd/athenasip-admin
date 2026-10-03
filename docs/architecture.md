# AthenaSIP Admin - Architecture

## Shape

```
src/
  main.tsx          Mounts the app and chooses which AdminApi it talks to.
  App.tsx           The shell: topbar, section bar, routes.
  app/              routes.ts (every path, named once) and navigation.ts.
  api/              The seam. AdminApi, an HTTP implementation, an in-memory fake.
  auth/             The session, roles in words, the sign-in and No permissions screens.
  realms/           A realm's registration and media policy, as a form and as words.
  components/       Shared UI: SectionNav, Modal, Status, VolumeMeter.
  hooks/            useRefreshableAsync, useSubmit, usePagination.
  screens/          One file per screen, each taking its AdminApi as a prop.
  softphone/        The WebRTC endpoint: a controller with no React in it, the JsSIP seam,
                    the page contract, and the entry for softphone.html.
  styles/           tokens.css (the palette), base.css (shell), admin.css (surfaces).
```

## The API seam

`src/api/AdminApi.ts` is an interface describing everything this client can ask a node to do.
Its contract is the server's `docs/api/openapi.yaml`, version 1: health, the node list, realms,
accounts, registrations, live calls and the media engine under `/api/v1`. There are two implementations:

- `HttpAdminApi` speaks to a real node. It is the only file in the repository that knows a
  URL, a verb or a status code exists. `src/api/contract.test.ts` checks every request it
  makes against the OpenAPI document in the sibling checkout, and skips when that checkout is
  not there.
- `FakeAdminApi` holds the same records in memory and enforces the same rules, read from the
  server's handlers: a duplicate is a `conflict`, an unknown realm `not_found`, a missing
  field `invalid_request`, a user without the route's role `forbidden`, and deleting a
  realm deletes its subscribers and their registrations because the server's does. It is what development runs
  against without a node, and what every screen test runs against.

A realm is addressed by its name and an account by its user, never by id: the server's ids
are 64-bit and arrive in JavaScript rounded.

## Authentication and roles

The console is a client of the admin API exactly as curl is. It signs in with `POST
/auth/login`, learns who it is and what it may do from `GET /session`, and presents the token as
a bearer on every request. `Session` (`src/auth/Session.ts`) holds it in memory only, and ends
itself at the node's expiry.

Roles are the server's five (`src/api/types.ts`, described for people in `src/auth/roles.ts`),
and nothing implies anything else. Navigation items and routes name the roles any of which
admits them; what a login cannot use is hidden, a screen reached directly says which role it
needs, and a login with no roles sees a No permissions page. The node's 403 is the rule and the
hiding a courtesy.

A 401 from any request ends the session wherever it happened, and the sign-in screen says why.
A 403 re-reads `/session`, because the node re-checks roles on every request and a role taken
away mid-session should leave the navigation at once. Every bearer is a session from a user's
login; the node has no configured tokens, and the console offers no other way in.

## Records and dialogues

A list shows records compactly and read-only. Nothing in a row is an input, so a list never
holds half-saved state. Every mutation opens a `FormModal` or a `ConfirmModal`, which own the
parts that must not vary between screens: focus management, Escape to cancel, Cancel before
the commit, and one busy flag disabling both.

## Loading

`useRefreshableAsync` distinguishes a first load, which has nothing to show and shows a
spinner, from a refresh, which already has a list on screen and keeps it. Replacing a working
list with a spinner to fetch the same list back is how a page that is working looks broken.

Aborts are not failures. Every request is cancelled on unmount and superseded on refresh.

## The softphone

`src/softphone/Softphone.ts` owns the JsSIP user agent and session and publishes an immutable
snapshot after every change. `SoftphoneScreen` renders it in the console and on
`softphone.html`, the page the end-to-end run opens; `src/softphone/page.ts` is the contract
that run drives it through. [softphone.md](softphone.md) has the whole of it.

## Styling

Hand-written CSS, no framework. The palette is in `src/styles/tokens.css` and follows
macha-client's structure — near-black ground, three layered surfaces, a three-step text ramp,
an accent ramp that lives at the bottom of its hue — with a blue-steel accent instead of
macha's crimson.

The accent marks *where you are*: the active nav item, the focused control, the primary
action. It never means "good". Green, amber and red are reserved for state a reader must not
have to interpret, and nothing else may use them.

Dark only. `color-scheme: dark` is set, so form controls and scrollbars follow.
