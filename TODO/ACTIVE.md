# AthenaSIP Admin - Active Work

This is the React administration frontend for [AthenaSIP](../athenasip), the SIP server in
the sibling checkout. The server is the source of truth: this repository renders and edits
what the server's admin API exposes, and ships as a static bundle the server serves itself.

Work happens on `develop`; `main` carries the last release, and `0.2.0` is the current one.
Move items to `COMPLETE.md` as they land, with a one-line note on what shipped. Line numbers
refer to the current tree; update them as files move.

## Resume here (2026-10-03)

Everything needed to pick this up after a clear, in the order it matters.

**The tree.** On `develop`, clean: six commits from `a4649f9` (sign-in) to
the docs commit, over `8a09898`, split by file, so only `9d971ce` onwards typechecks (the API layer
changed under every screen at once). Not pushed. Commit only when asked, never with Claude
attribution (the user's global rule).

**Deployed** (Tom approved in this session, 2026-10-03): corvus-fi-1 serves
`assets/index-CzSube6u.js`, and the server session has been told.

**Waiting on Tom:**

1. Sign in on corvus-fi-1 and click through every screen as users with different roles.
2. Still open from before: whether `/realms/{realm}/accounts` becomes `/subscribers` (build
   against `/accounts`), and whether deleting a realm deletes its subscribers (build as if not).

**After a deploy:** check `curl -s http://10.35.1.20:8080/ | grep -o 'assets/index-[^"]*'`
matches `build/assets/index-*.js`, tell the server session, and ask Tom to sign in and click
through every screen as users with different roles. The account `athenaphone` on realm
`10.35.1.20` has `media_profile: webrtc` and should show a WebRTC tag on Subscribers.

**The server's session.** "AthenaSIP Server" (find it with ListAgents, message with
SendMessage). It owns `../athenasip`, the node and every fixture; nothing here edits them,
and nothing here starts or stops their containers. Its `develop` is at `096fb78`, serving
`13cf9a0` or later on corvus-fi-1. It proposes API changes before building them, and asked to
be told after every console deploy. A peer cannot approve a deploy or anything else for Tom.

**Where the console runs.** On corvus-fi-1, `http://10.35.1.20:8080/`, served by the node in
SPA mode from `/usr/local/share/athenasip/admin`. Deploy by building with the live flag and
syncing; the node needs no restart. The rsync needs Tom's approval each time: the permission
layer treats it as a production deploy.

```
VITE_ATHENASIP_LIVE=true npm run build
rsync -az --delete --no-owner --no-group build/ root@10.35.1.20:/usr/local/share/athenasip/admin/
```

Without `VITE_ATHENASIP_LIVE=true` the bundle talks to the in-memory fake, which is wrong for
a deployment. `--no-owner --no-group` keeps the files root-owned on the host; a plain `-a`
copies them as `tom`, which would let that account rewrite what the node serves. This session
holds no login for the node and has never signed in there.

**The browser test.** The server's `test/interop/browser.sh` runs `e2e/` in two phases, direct
and relayed through coturn (`--direct`, `--relay` for one), and owns the fixture's lifecycle.
The relay phase signs in as `ATHENA_INTEROP_API_USER` / `_PASSWORD`, which `up.sh` generates
per run. Both relay tests passed on 2026-10-01 against the uncommitted tree. On this machine
the fixture needs alternate ports (15060/15061/18088/18080 worked).

**Other sessions.** "TOMS", the site dashboard on corvus-fi-1, monitors the node through
`GET /api/v1/health` and needed nothing more from here.

## The API contract, as built

The server's `docs/api/openapi.yaml` is the reference (every operation has an `operationId`),
with `docs/authentication.md`. `src/api/contract.test.ts` checks every path and verb the
client uses against it; it does not check fields. If a later server session says otherwise,
point it there.

- **Roles.** Five, nothing implying anything, no superuser, none by default:
  `view-cluster-status`, `manage-admin-users`, `manage-realms`, `manage-realm-subscribers`,
  `manage-cluster`. A user with no roles is valid and can sign in.
- **Sign-in.** `POST /auth/login {username, password}` to `{token, expires_at, roles}`, Unix
  seconds, absolute; an idle expiry arrives as a 401. `POST /auth/logout` is always 204.
  `GET /session` is `{kind: "user", username, display_name, roles, expires_at}`. There are no
  configured API tokens and no setup token (Tom, 2026-10-01): the first user and recovery are
  `athenasip --add-user` on the host.
- **Users.** `/users` CRUD, `DELETE /users/{u}/sessions`, `POST /users/{u}/password
  {password, old_password?}` (`old_password` only without `manage-admin-users`; wrong is 403
  `wrong_password`, not a sign-out; it ends every session of that user). Nobody disables,
  demotes or deletes themselves: 409 `would_lock_out`. 400 `unknown_role`.
- **Failures.** 401 for bad credentials and a disabled user alike; 403 for a real credential
  without the role; 503 `unavailable` when the datastore cannot be asked, never a sign-out;
  429 with Retry-After.
- **Realms.** Reading admits `manage-realms` or `manage-realm-subscribers`; writing needs
  `manage-realms`. Each realm carries `behaviour` (its own settings, null to inherit),
  `behaviour_effective` (what they come to) and `behaviour_default` (the server's own):
  `media_anchor` bool, `media_profile` mirror|transport|rtp|webrtc|srtp, `qualify_interval`
  0 or 5 to 86400 seconds, `rewrite_contact` bool. Server defaults: true, mirror, 0, false.
  A setting left out of an update is left alone, null resets it, and anything unknown or out
  of range is a 400 that changes nothing. Top-level `media_anchor`/`media_profiles` are refused.
- **Accounts** (subscribers). `behaviour: {media_profile}` only, null for the realm's; a PUT
  takes a password, the behaviour, or both.
- **Status reads** (`view-cluster-status`): `/nodes` (status, version, `stale`, `at`),
  `/registrations`, `/client/config` (`websocket_uri`, `websocket_uris`, `nodes`,
  `transports`, `ice_servers` minted per request), `/calls` and `/calls/{call}` (Call-ID
  percent-encoded, `%2F` one segment; per-leg cumulative counters, a direction the engine does
  not count absent rather than 0, `participant` always null), `/media` (engine, connected,
  capabilities, never its URL), `/media/reoffers` (accounts that answered 488, with a
  suggested profile nothing applies), `/qualify` (probed clients). `/metrics` is Prometheus
  text for a monitoring system; the console does not read it.
- The API is RESTful and usable without the console. Nothing is added for the UI's sake.

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
- (2026-09-18) Auth is a bearer token held in memory. Never `localStorage`: a token there is a
  token in every future session of that browser. Never a cookie either, per the server's
  design: the console is a client of the API like curl is.
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
  any of them is a change to both repositories. `docs/softphone.md` names exactly what the
  server's `generated/fixture.env` exports, since `browser.sh` sources it into the spec.
- (2026-09-23) The harness page is a second Vite entry, `softphone.html`, not a route, so a
  page the harness opens never depends on a history fallback. The console's
  `/diagnostics/softphone` is a real path, which the node's SPA mode now serves on reload.
- (2026-09-23) The end-to-end run targets the server's interop fixture
  (`test/interop/up.sh --rtpengine`), not its sipp harness. The sipp harness keeps rtpengine
  on a closed bridge with nothing published, so a browser on the host cannot reach its media
  at all; the interop fixture publishes rtpengine's port range and advertises the host's
  address for exactly this. The page is opened over loopback, which is a secure context, so
  `getUserMedia` needs no insecure-origin flag.
- (2026-09-23) The fixture's lifecycle belongs to the server's `test/interop/browser.sh`
  alone: it brings the fixture up, runs this repository's spec and takes it down. Nothing
  here starts or stops containers, and the spec is not run by hand against a fixture the
  server's session is driving. Two sessions driving one fixture collided twice on the first
  evening. On this machine it needs the alternate ports in `docs/softphone.md`.
- (2026-09-23) `@playwright/test` is a development dependency. It is the harness the server's
  own plan names, and principle 3 is about the bundle. It is not imported by anything under
  `src/`.
- (2026-09-23) The spec asserts the selected candidate pair's address, never its state. One
  end once read `in-progress` while ICE, the connection and DTLS all said connected, because
  it was sampled as the callee hung up.
- (2026-09-25) The spec proves audio by accumulated `totalAudioEnergy`, not the instantaneous
  `audioLevel`: the fake device beeps, and an instant can land in the gap.
- (2026-09-25) Admin authentication follows the server's `docs/authentication.md` and the
  contract above. The console shows what the roles permit and hides the rest; the node's 403
  is the rule. A user with no roles can sign in and is told plainly that they have no
  permissions. A change is a change to both repositories.
- (2026-09-25) A user is somebody or some system that uses the API. A subscriber is something
  registered on a realm to make and receive calls. The console says "subscriber" for what the
  API calls an account (`/realms/{realm}/accounts`, type `Account`), and never mixes the two.
- (2026-09-30) A test asserts facts about our configuration, never the browser's labels. The
  relay phase knows a relayed pair by its local port being inside coturn's range, because
  Chrome reports the relayed candidate as `prflx`. Agreed with the server, and written into its
  `docs/testing.md` as a general rule.
- (2026-09-30) The relay reaches the automated layer by adding coturn to the interop fixture,
  not by merging that fixture into the quickstart: the fixture is memory:// and local:// so a
  SIP test cannot fail for a Redis reason. Two phases in `browser.sh`, since no one advertised
  address serves both a direct and a relayed call without the LAN.
- (2026-09-30) The harness page never holds an API token. The spec fetches `/client/config`
  from Node and passes `ice` and `relay=1`; the page strips `ice` from the address bar like
  `password`. The console's softphone asks the API itself, per call, and offers "Relay only".
- (2026-10-01) No configured API tokens (Tom). Sign-in is a username and password only; a node
  too old for logins is said to be too old, not offered another way in. The first user and
  recovery are `athenasip --add-user` on the host, which the console points to.
- (2026-10-01) Media counters are cumulative and the console takes the rate. One-way audio is a
  direction standing still between two readings while another in the same call moves. A
  direction the engine does not count is "not counted", never 0 and never a fault.
- (2026-10-02) A setting that can inherit is a select whose first option is "Server default
  (X)" or "Realm default (X)", which sends null; X is the value it would inherit, named only
  when the node says it. Rows mark an inherited value rather than hiding the fact.
- (2026-10-02) The node suggests and the operator decides: a re-offer's suggested profile is a
  button on its row, never applied by itself.

---

## Milestone 1 - Against the real node

- [ ] Sign in on corvus-fi-1 and click through every screen with users of different roles, once
      the current build is deployed. Nothing authenticated has been run against a live node
      from here; the screens added since 2026-10-01 have only met the fake.
- [ ] Remove the realm-delete warning in `DeleteRealm` (`src/screens/RealmsScreen.tsx`) and the
      matching behaviour in the fake, if the server decides to cascade the delete. Undecided.
- [ ] Rename `/realms/{realm}/accounts` to `/subscribers` here and in the fake, if the server
      decides to. Undecided.
- [ ] Keep a half-filled dialogue across a session's end. The top bar counts down the last five
      minutes, but at the instant the console still replaces the screen with the sign-in form.
      Signing in again over the screen, as the same user, would keep it; a different user must
      not inherit it.
- [ ] Generate `src/api/types.ts` from the OpenAPI document rather than hand-maintaining it,
      naming methods after the `operationId`s. The contract test catches a path or verb this
      client makes up; it does not catch a field, and the behaviour section has grown by a
      field four times in two days.
- [ ] Server-side paging, replacing `usePagination`, when the server pages. It does not yet.
- [ ] `manage-cluster` has no screen, because the server has no route for it yet (node
      membership and configuration). The role is shown and can be granted.

## The browser test

- [ ] A few seconds' delay before the callee answers in `e2e/browser-call.spec.ts`, so a call
      that only fails after ringing is caught. The automated call answers within milliseconds,
      which is how it missed the server's DTLS-role bug (fixed there in `ec43d9c`). Agreed
      with the server session; the knob is ours.

## Milestone 2 - Live view

Calls, the media engine, re-offers, probed clients and the cluster are read by polling or a
Refresh button. See `COMPLETE.md` for what shipped.

- [ ] Decide the transport for pushed events with the server: server-sent events or a
      WebSocket on the HTTP listener. MQTT over WebSocket straight to the browser is the
      alternative and a much larger security surface. The server has not built either.
- [ ] Push calls, registrations and counts rather than polling them, once there is a stream.
- [ ] Hang up a call from the Calls screen. Needs the node to send BYEs itself, its M6.
- [ ] Match legs to participants on the Calls screen once the node fills `participant`.
      Nothing is planned on the server for it.
- [ ] Softphone failover: `GET /client/config` gives `websocket_uris`, healthy nodes in order.
      The softphone uses only `websocket_uri`. Trying the next URI when a socket fails would
      use it; nothing needs it while corvus-fi-1 is one node.
- [ ] The media engine's own settings (which engine, its port range), once the server exposes
      them. Today they are in the node's configuration file only.

## Milestone 3 - Settings and the rest of Security

- [ ] Read and edit the server's config sections, with validation and an honest distinction
      between what can change on a running node and what needs a restart. The Settings screen
      says why it is empty; it should stay empty until that distinction can be stated.
- [ ] TLS: certificate subject, issuer and expiry, cipher policy, `allow_unencrypted`.
- [ ] "Terminate all calls" and "Restart server", against real endpoints, with confirmation.

## Milestone 4 - Polish

- [ ] An error boundary around the main panel. A screen that throws currently takes the shell
      with it.
- [ ] A toast region, so a background refresh failure does not have to become a banner inside
      whichever panel happened to trigger it.
- [ ] Lint. There is no ESLint configuration at all since CRA's went with it, and
      `useRefreshableAsync` and `useSoftphone` carry `eslint-disable` comments for a rule
      nothing enforces.
- [ ] CI: typecheck, test and build on push. The end-to-end run, both phases, stays manual
      until the server's fixture can be brought up in CI.
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
