# AthenaSIP Admin - Active Work

This is the React administration frontend for [AthenaSIP](../athenasip), the SIP server in
the sibling checkout. The server is the source of truth: this repository renders and edits
what the server's admin API exposes, and ships as a static bundle the server serves itself.

Work happens on `develop`; `main` carries the last release, and `0.2.0` is the current one.
Move items to `COMPLETE.md` as they land, with a one-line note on what shipped. Line numbers
refer to the current tree; update them as files move.

## Where this stands (2026-09-23)

Vite, TypeScript and Vitest, in the same shape as `../macha-client`, whose visual language
this client shares. `npm test` (86 tests), `npm run typecheck` and `npm run build` pass. The
rebuild is committed, `develop` exists, and 0.2.0 is on `main`.

The server's admin API now exists. "Admin API, part 1" landed on the server on 2026-09-21:
`/api/v1/health`, `/nodes`, `/realms`, `/realms/{realm}`, `/realms/{realm}/accounts`,
`/realms/{realm}/accounts/{user}` and `/registrations`, bearer tokens with `admin` and
`client` scopes from the node's `http.api.tokens`, and one error envelope. It is described
by `../athenasip/docs/api/openapi.yaml`, which is authoritative. `HttpAdminApi` was written
against the plan for that API, and the plan and the document differ in ways listed under
Milestone 2. That milestone is unblocked and is the next thing to do after the softphone.

The softphone is now the browser end of the server's end-to-end run. The server's Milestone
3 is one call, a browser to an AthenaPhone through rtpengine, and its first item is two
browsers through rtpengine driven by a headless browser. On 2026-09-23 the server's session
decided that this client's softphone is that page rather than a throwaway one in the server's
tree. What exists: a controller with no React in it, a page of its own the node serves as a
plain file, a query string and a window-level readout to drive it by, and a Playwright spec
in `e2e/` that registers two browsers and calls each way. What has not happened is a run of
it against the fixture, which is Milestone 1 below.

There is still no authentication in this client. `HttpAdminApi` takes a token callback and
sends a bearer header when there is one, but nothing supplies one, there is no login screen,
and a 401 is not handled as a session problem. That is Milestone 3.

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

## Decisions

Dated, and not reopened without asking.

- (2026-09-18) The stack follows `../macha-client`: Vite, TypeScript, Vitest, react-router-dom,
  hand-written CSS. Divergence from it needs a reason specific to this client.
- (2026-09-18) `src/api/` is the only place that knows HTTP exists. Components call hooks,
  hooks call `AdminApi`. No `fetch` in a component, and no URL outside `HttpAdminApi`.
- (2026-09-18) `FakeAdminApi` is one implementation for development and for tests. A test
  must not pass against a fixture the running application never sees.
- (2026-09-18) Screens take their `AdminApi` as a prop rather than reading a module singleton
  or a context, so a test renders one screen against an API it controls.
- (2026-09-18) A list is read-only and every mutation opens a dialogue. Nothing in a record
  row is an input, so a list never holds half-saved state.
- (2026-09-18) The API base URL is same-origin and empty by default. The dev server proxies
  `/api` so development is same-origin too; a build-time absolute URL is a development
  override only.
- (2026-09-18) Auth is a bearer token held in memory in a context. Never `localStorage`: a
  token there is a token in every future session of that browser.
- (2026-09-18) The accent colour marks position, never approval. Green, amber and red are
  reserved for state, and nothing else may use them.
- (2026-09-18) Dark only. A second theme is a second set of contrast decisions to get wrong,
  for a console read beside a terminal.
- (2026-09-18) The softphone is a diagnostic, not a product. It stays under Diagnostics and
  out of the provisioning navigation.
- (2026-09-18) Client-side paging is a placeholder (`usePagination`), isolated so that
  server-side paging replaces it in one place.
- (2026-09-18) Follow the server's branch policy: work on `develop`, `main` carries the last
  release, tags are bare `x.y.z` semver.
- (2026-09-23) The softphone is the server's Milestone 3 browser page. Agreed with the
  server's session, and recorded as a decision on its side too. The Playwright spec lives
  here beside the page; the server brings the node and rtpengine up and asserts the engine's
  counters afterwards. The only contract between the two is the query string, the
  window-level readout and the environment names in `docs/softphone.md`, and a change to
  any of them is a change to both repositories.
- (2026-09-23) The harness page is a second Vite entry, `softphone.html`, not a route. The
  node's static middleware has no history fallback, and a page the harness opens must not
  depend on one. The console keeps `/diagnostics/softphone` as a real path and asks the
  server for the fallback, because a reload on any console path 404s today.
- (2026-09-23) The end-to-end run targets the server's interop fixture
  (`test/interop/up.sh --rtpengine`), not its sipp harness. The sipp harness keeps rtpengine
  on a closed bridge with nothing published, so a browser on the host cannot reach its media
  at all; the interop fixture publishes rtpengine's port range and advertises the host's
  address for exactly this. The page is opened over loopback, which is a secure context, so
  `getUserMedia` needs no insecure-origin flag; the socket and the media go to whatever the
  node advertises.
- (2026-09-23) The fixture's lifecycle belongs to the server's `test/interop/browser.sh`
  alone: it brings the fixture up, runs this repository's spec and takes it down. Nothing
  here starts or stops containers, and the spec is not run by hand against a fixture the
  server's session is driving. Two sessions driving one fixture collided twice on the first
  evening.
- (2026-09-23) `@playwright/test` is a development dependency. It is the harness the server's
  own plan names, and principle 3 is about the bundle. It is not imported by anything under
  `src/`.

---

## Milestone 1 - After the first browser-to-browser call

The call itself passed on 2026-09-23 and is recorded in `COMPLETE.md`. The server's
Milestone 3 has one item left, a browser to an AthenaPhone on a real device, which is manual
and is the server's to run. What is left here:

- [ ] Assert the far end's audio as well as its packet count. The passing run reported an
      instantaneous `audioLevel` above zero at every end, from 0.016 to 1, but Chromium's fake
      device plays a periodic beep, so an instant can land in the gap. Accumulate
      `inbound-rtp.totalAudioEnergy` instead, which only grows, and assert it is above zero.
      Packets prove the relay; energy proves the payload was not silence.
- [ ] Do not assert the selected pair's state. One end of the second test read
      `in-progress` rather than `succeeded` while ICE, the connection and DTLS all said
      connected: it was sampled as the callee hung up. The spec asserts only the pair's
      address, and should stay that way.
- [ ] Keep `docs/softphone.md` naming what the server's `generated/fixture.env` exports, since
      `browser.sh` sources it into the spec.

## Milestone 2 - Against the real API

Unblocked on 2026-09-21. `../athenasip/docs/api/openapi.yaml` is the contract, and these are
the differences between it and what `HttpAdminApi` and `types.ts` currently assume, found by
reading the two side by side:

- [ ] **The error envelope** is `{"error": {"code", "message"}}`, not `{"message"}`.
      `describeFailure` (`src/api/HttpAdminApi.ts:100`) reads the wrong shape and so renders
      the status line for every failure. `code` is one of `invalid_json`, `invalid_request`,
      `unauthorized`, `forbidden`, `not_found`, `method_not_allowed`, `conflict`,
      `datastore_error`; `ApiError.code` is reserved for exactly this.
- [ ] **Subscriber is Account**, the server's decision of 2026-09-21, because it would have
      collided with SUBSCRIBE the moment presence arrived. `/realms/{realm}/accounts`, keyed
      by `user` and not by an id, with `id` derived from the URI. An account is `{id, uri,
      user, realm}`: no `display_name`, no `enabled`. Rename the type, the screen, the route
      and the navigation label.
- [ ] **A realm is keyed by name**, not by an id, and carries `nonce_expiry`,
      `registration_timeout`, `registration_minimum`, `media_anchor` and `media_profiles`,
      none of which the Realms screen shows. It has no `description` and no
      `subscriber_count`. `PUT` changes only the fields given.
- [ ] **A registration** is `{account, account_id, contact, registered_at, expires_at, nat,
      node_id, flow_id, path}`, with no `transport` and no `user_agent`, and `GET
      /registrations?realm=` filters by realm. `describeExpiry` wants milliseconds and
      `expires_at` is seconds.
- [ ] **There is no `/status`.** The Overview screen's `ServerStatus` has to be assembled
      from `/health` (`status`, `node`, `version`, `datastore`) and `/nodes` (one entry per
      transport with its URI); there is no uptime, no registration count and no call count
      until the server's part 2. Show what exists and say why the rest is empty.
- [ ] **There is no `/media/rtprelay`.** The relay is configured in the node's file, not
      over the API. What the API does expose about media is per realm: `media_anchor` and
      `media_profiles` (`transport`, `mirror`, `rtp`, `webrtc`, `srtp`). The RTP Relay screen
      becomes a realm's media policy, and the port-range form goes until the server has a
      settings endpoint.
- [ ] Generate `src/api/types.ts` from the OpenAPI document rather than hand-maintaining a
      second description, and check `HttpAdminApi`'s paths against it in a test.
- [ ] Field-level error mapping: a `conflict` on a realm name belongs against the name
      field, not in the dialogue's general error slot. The `code` makes this possible.
- [ ] Server-side paging, replacing `usePagination`, when the server pages. It does not yet.
- [ ] Drive the console against the served bundle by hand once, now that the server has the
      history fallback and the MIME map right (2026-09-23, uncommitted there). Both were
      verified by the server's session with `curl`; nobody has yet clicked through a reload
      on `/sip/realms` in a browser.
- [ ] Bring `FakeAdminApi` into line with every change above, so the fake enforces the
      server's rules and not the plan's.

## Milestone 3 - Authentication

Everything here is possible now. The server's tokens live in its config file with `admin`
and `client` scopes, which is enough to build and test the whole path against.

- [ ] Login screen, and an auth context holding the token in memory.
- [ ] Wire the context into `HttpAdminApi`'s `token` callback. The seam is already there and
      already tested; nothing supplies it.
- [ ] A 401 anywhere is the session's problem, not the screen's: clear the token and send the
      viewer to the login screen, recording where they were so they land back there.
      `ApiError.isAuthFailure` exists for exactly this and has no caller.
- [ ] An account menu in the topbar with Log out, replacing the Settings link that currently
      sits there.
- [ ] Scopes: `admin` and `client`. Hide what an account cannot use rather than letting it
      click through to a 403.
- [ ] Decide the refresh story once the server's token model is decided, and until then fail
      honestly rather than pretending a token lasts forever.

## Milestone 4 - Live view

Needs the server's admin API part 2, which is not built: `/api/v1/calls`, `/api/v1/media`
and `/api/v1/events` are open items under its Milestone 5.

- [ ] Decide the transport with the server: server-sent events or a WebSocket on the HTTP
      listener. MQTT over WebSocket straight to the browser is the alternative and a much
      larger security surface.
- [ ] Active calls: from, to, state, duration, media engine, with a terminate action.
- [ ] Push registrations and counts rather than polling them.
- [ ] Media: per-session engine stats. The server notes that the builtin relay keeps no
      counters a harness can read and that the live-calls page is where that gets answered.
- [ ] Client provisioning: `GET /api/v1/client/config` (WSS URL, ICE servers, TURN
      credentials) is planned on the server. When it exists the softphone reads its socket
      URL and ICE servers from it instead of the page's host and an empty list.

## Milestone 5 - Settings and the rest of Security

- [ ] Read and edit the server's config sections, with validation and an honest distinction
      between what can change on a running node and what needs a restart. The Settings screen
      says why it is empty; it should stay empty until that distinction can be stated.
- [ ] TLS: certificate subject, issuer and expiry, cipher policy, `allow_unencrypted`.
- [ ] Admin accounts and scopes, once the server has more than config-file tokens.
- [ ] "Terminate all calls" and "Restart server", against real endpoints, with confirmation.

## Milestone 6 - Polish

- [ ] An error boundary around the main panel. A screen that throws currently takes the shell
      with it.
- [ ] A toast region, so a background refresh failure does not have to become a banner inside
      whichever panel happened to trigger it.
- [ ] Lint. There is no ESLint configuration at all since CRA's went with it, and
      `useRefreshableAsync` and `useSoftphone` carry `eslint-disable` comments for a rule
      nothing enforces.
- [ ] CI: typecheck, test and build on push. The end-to-end run stays manual until the
      server's fixture can be brought up in CI.
- [ ] Accessibility pass: the record rows use `role="group"` with a label, which works, but
      the pattern deserves checking against a screen reader rather than against the tests
      that assert it.
- [ ] Responsive check below 800px. The topbar collapses and the section bar scrolls, neither
      has been driven on a real phone.
- [ ] Ship the bundle as part of the server's release rather than copying `build/` by hand.
      The server's session would rather not check a built bundle into its tree; a release
      artefact is the alternative.

## Parked

- Light theme. Not until somebody asks.
- i18n. Not until there is a second language.
- Video in the softphone. The server's Milestone 3 is audio only until the first call is
  made, and a second m-line doubles the published port range for nothing.
- Replacing the softphone's level meters entirely. The negotiation readout now carries ICE,
  DTLS, the candidate pair, the codec and the counters; the meters still answer "is there
  audio at all" for a person, which is the question that matters first.
