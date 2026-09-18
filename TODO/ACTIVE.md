# AthenaSIP Admin - Active Work

This is the React administration frontend for [AthenaSIP](../athenasip), the SIP server in
the sibling checkout. The server is the source of truth: this repository renders and edits
what the server's admin API exposes, and ships as a static bundle the server serves itself.

Move items to `COMPLETE.md` as they land, with a one-line note on what shipped. Line numbers
refer to the current tree; update them as files move.

## Where this stands (2026-09-18)

Vite, TypeScript and Vitest, in the same shape as `../macha-client`, whose visual language
this client now shares. `npm test` (58 tests), `npm run typecheck` and `npm run build` pass.
The main bundle is 92.6 kB gzip with JsSIP split out behind the softphone route.

Every screen is wired through `AdminApi`, and both implementations of it exist: `HttpAdminApi`
against the real server, `FakeAdminApi` in memory. The fake enforces the rules the server
will, so the error paths are real ones and the screens were built against something that
pushes back. That is the whole preparation: the day `/api/v1` exists, `VITE_ATHENASIP_LIVE`
flips and nothing above `src/api/` has to change.

What does not exist is the server side. `AdminAPI` (`../athenasip/src/api/admin_api.cpp`) is a
Beast HTTP server with a middleware chain, a static-file middleware and four status helpers:
no `/api/v1` routes, no auth, no JSON body parsing. The endpoints this client calls are the
ones specified under "Admin API, part 1" in `../athenasip/TODO/ACTIVE.md`. Nothing here is
blocked on design work; it is blocked on those routes.

There is also still no authentication anywhere in this client. `HttpAdminApi` takes a token
callback and sends a bearer header when there is one, but nothing supplies one, there is no
login screen, and a 401 is not handled as a session problem. That is the largest gap that
does not depend on the server, and it is Milestone 1 below.

The working tree carries the rebuild and is not yet committed.

## Principles

1. **The server owns the truth.** This is a view over the admin API. No state that matters
   lives only in the browser, and nothing is faked in the UI that the API cannot supply.
2. **Works out of the box.** The server serves this bundle from its own HTTP listener. A
   fresh install reaches a usable admin page with no build step and no separate web server.
3. **Low dependency.** React, React Router and JsSIP, with hand-written CSS. A new runtime
   dependency needs a reason that a few lines of our own code cannot meet.
4. **Usable without a telecoms background.** Every screen explains the concept before it asks
   you to configure it, the way Realms does.
5. **No secrets in the bundle.** Credentials are entered, held in memory, and never compiled
   in or written to browser storage.

## Decisions (2026-09-18)

- The stack follows `../macha-client`: Vite, TypeScript, Vitest, react-router-dom, hand-written
  CSS. Divergence from it needs a reason specific to this client.
- `src/api/` is the only place that knows HTTP exists. Components call hooks, hooks call
  `AdminApi`. No `fetch` in a component, and no URL outside `HttpAdminApi`.
- `FakeAdminApi` is one implementation for development and for tests. A test must not pass
  against a fixture the running application never sees.
- Screens take their `AdminApi` as a prop rather than reading a module singleton or a context,
  so a test renders one screen against an API it controls.
- A list is read-only and every mutation opens a dialogue. Nothing in a record row is an
  input, so a list never holds half-saved state.
- The API base URL is same-origin and empty by default. The dev server proxies `/api` so
  development is same-origin too; a build-time absolute URL is a development override only.
- Auth is a bearer token held in memory in a context. Never `localStorage`: a token there is a
  token in every future session of that browser.
- The accent colour marks position, never approval. Green, amber and red are reserved for
  state, and nothing else may use them.
- Dark only. A second theme is a second set of contrast decisions to get wrong, for a console
  read beside a terminal.
- The softphone is a diagnostic, not a product. It stays under Diagnostics and out of the
  provisioning navigation.
- Client-side paging is a placeholder (`usePagination`), isolated so that server-side paging
  replaces it in one place.
- Follow the server's branch policy: work on `develop`, `main` carries the last release, tags
  are bare `x.y.z` semver.

---

## Milestone 1 - Authentication

Everything here is possible now. The server's tokens live in its config file for the moment,
which is enough to build and test the whole path against.

- [ ] Login screen, and an auth context holding the token in memory.
- [ ] Wire the context into `HttpAdminApi`'s `token` callback. The seam is already there and
      already tested; nothing supplies it.
- [ ] A 401 anywhere is the session's problem, not the screen's: clear the token and send the
      viewer to the login screen, recording where they were so they land back there.
      `ApiError.isAuthFailure` exists for exactly this and has no caller.
- [ ] An account menu in the topbar with Log out, replacing the Settings link that currently
      sits there.
- [ ] Scopes: `admin` and `client` per the server's plan. Hide what an account cannot use
      rather than letting it click through to a 403.
- [ ] Decide the refresh story once the server's token model is decided, and until then fail
      honestly rather than pretending a token lasts forever.

## Milestone 2 - Against the real API

Blocked on "Admin API, part 1" in `../athenasip/TODO/ACTIVE.md`. Each item is a matter of
flipping `VITE_ATHENASIP_LIVE` and fixing what the real server does differently.

- [ ] Check `HttpAdminApi` against `docs/api/openapi.yaml` when the server has one, and
      generate `src/api/types.ts` from it rather than hand-maintaining a second description.
- [ ] Reconcile the wire format: paths, status codes, the error envelope, and whether the
      server sends a machine-readable `code` alongside `message` (`ApiError.code` is reserved
      for it and always undefined today).
- [ ] Server-side paging, replacing `usePagination`.
- [ ] Field-level error mapping: a 409 on a realm name belongs against the name field, not in
      the dialogue's general error slot.
- [ ] Rebuild into `../athenasip/admin/` and confirm the server serves it, once
      `StaticMiddleware` reads `config->http_files_path` rather than a hardcoded `"../admin"`
      (`../athenasip/src/main.cpp:122`).

## Milestone 3 - Live view

Needs the server to expose events to a browser. It has an event system (`local://`, `mqtt://`)
and no browser-facing feed.

- [ ] Decide the transport: server-sent events or a WebSocket on the HTTP listener. MQTT over
      WebSocket straight to the browser is the alternative and a much larger security surface.
- [ ] Active calls: from, to, state, duration, media engine, with a terminate action.
- [ ] Push registrations and counts rather than polling them.
- [ ] Media: per-session relay stats, allocated ports against the configured range.

## Milestone 4 - Settings and the rest of Security

- [ ] Read and edit the server's config sections, with validation and an honest distinction
      between what can change on a running node and what needs a restart. The Settings screen
      says why it is empty; it should stay empty until that distinction can be stated.
- [ ] TLS: certificate subject, issuer and expiry, cipher policy, `allow_unencrypted`.
- [ ] Admin accounts and scopes, once the server has more than config-file tokens.
- [ ] "Terminate all calls" and "Restart server", against real endpoints, with confirmation.

## Milestone 5 - Polish

- [ ] Commit the rebuild, create `develop`, and move work onto it per the server's branch
      policy.
- [ ] An error boundary around the main panel. A screen that throws currently takes the shell
      with it.
- [ ] A toast region, so a background refresh failure does not have to become a banner inside
      whichever panel happened to trigger it.
- [ ] Lint. There is no ESLint configuration at all since CRA's went with it, and
      `useRefreshableAsync` carries an `eslint-disable` comment for a rule nothing enforces.
- [ ] CI: typecheck, test and build on push.
- [ ] Accessibility pass: the record rows use `role="group"` with a label, which works, but
      the pattern deserves checking against a screen reader rather than against the tests
      that assert it.
- [ ] Responsive check below 800px. The topbar collapses and the section bar scrolls, neither
      has been driven on a real phone.
- [ ] Ship the bundle as part of the server's release rather than copying `build/` by hand.

## Parked

- Light theme. Not until somebody asks.
- i18n. Not until there is a second language.
- Replacing the softphone's level meters with a proper media diagnostic (jitter, loss, codec,
  ICE state). The meters answer "is there audio at all", which is the question that matters
  first.
