# AthenaSIP Admin - Completed Work

The record of what exists and works in the tree. Move items from `ACTIVE.md` as they land,
with a one-line note on what shipped.

## The first browser-to-browser call (2026-09-23)

Two Chromium browsers called each other through AthenaSIP and rtpengine, both directions,
with audio proven at both ends. It is the first item of the server's Milestone 3, and the
server records rtpengine's side of the same run in its own `TODO/COMPLETED.md`.

- [x] Run by the server's `test/interop/browser.sh` against the interop fixture with
      `--rtpengine --admin`, on alternate ports because `athenaphone-asterisk` holds the
      defaults on this machine. Both tests passed in 14.3 seconds.
- [x] Every end: call connected, ICE, connection and DTLS connected, Opus, packets sent and
      received with none lost, and the selected remote candidate `10.35.1.132` on a port in
      the published range. That is the address rtpengine advertises, so each browser was
      sending to the engine and not to the other browser. rtpengine's own counters for the
      earlier runs showed about 2,500 packets a leg, DTLS-SRTP with the fingerprint verified,
      no errors and no loss.

| Test | End | Sent | Received | Lost | Remote candidate |
| --- | --- | --- | --- | --- | --- |
| 1001 calls 1002, caller hangs up | 1001 | 110 | 110 | 0 | 10.35.1.132:23014 |
| | 1002 | 112 | 110 | 0 | 10.35.1.132:23000 |
| 1002 calls 1001, callee hangs up | 1002 | 109 | 109 | 0 | 10.35.1.132:23010 |
| | 1001 | 115 | 112 | 0 | 10.35.1.132:23000 |

- [x] The first run found one bug, and it was here. JsSIP creates and announces an outgoing
      call's peer connection before it announces the session, so the controller subscribed
      too late and the caller never reported an ICE state, while media flowed and rtpengine
      relayed it cleanly. It was found by putting the engine's counters beside the browser's,
      which is the case for two witnesses. `Softphone.adopt` now takes a connection the
      session already has, with a regression test.
- [x] The README states the version under its header, and a test keeps it equal to
      `package.json`.

## The softphone as the server's browser page (2026-09-23)

AthenaSIP's Milestone 3 is one call, a browser to an AthenaPhone through rtpengine, and its
first item is two browsers through rtpengine driven by a headless browser. The server's plan
said "a minimal JsSIP page served by the node's own static middleware"; on 2026-09-23 its
session and this one agreed that this client's softphone is that page, and the server
recorded it as a decision. Requirements were taken from the server's session in writing:
target the interop fixture and not the sipp harness, open the page over loopback, send the
browser's offer as-is with no ICE servers, audio only, accounts `1001` and `1002` as
provisioned, and expose the descriptions, the ICE and DTLS state, the selected candidate pair
and the packet counters so the browser and the engine are two witnesses to the same media.

### The controller

- [x] `src/softphone/Softphone.ts`: the JsSIP user agent and session behind a class with
      nothing of React in it. Register, unregister, call, answer, hang up, and an immutable
      snapshot after every change: registration and call state, direction, the far end's
      identity, the cause, both session descriptions as the page saw them, and the peer
      connection's signaling, gathering, ICE and connection states. `waitFor(predicate)` for
      a test that will not sleep, and `history` for what happened, in order, with timestamps.
- [x] `stats()` summarises `getStats()` into what says whether media moved and where: packets
      and bytes each way, packets lost, the far end's audio level, the codec, the DTLS state,
      and the selected candidate pair resolved to each end's address, port and candidate
      type. Falls back to the nominated succeeded pair where there is no `transport` record,
      which is Firefox.
- [x] One call at a time: a second arriving while one is up is refused with 486 rather than
      silently replacing it. A socket that drops takes the registration with it, whatever the
      registrar still believes. A 180 going out is not the far end ringing, so `ringing` is
      only ever set on an outgoing call.
- [x] JsSIP is injected through `SipStack` (`src/softphone/jssip.ts`), so the controller's
      tests drive it with a user agent that never opens a socket, and only the page that
      needs JsSIP loads it.

### The page contract

- [x] `src/softphone/page.ts`: the query string (`ws`, `uri`, `password`, `target`,
      `register=1`, `answer=1`) and the window-level readout `window.__athenaSoftphone`
      with `version`, `state()`, `history()`, `stats()`, `call()`, `answer()` and `hangUp()`.
      The password is removed from the address bar as soon as it has been read.
- [x] `softphone.html`, a second Vite entry that mounts the same `SoftphoneScreen` with no
      console around it and no router, so the node's static middleware serves it as a plain
      file with no history fallback. The console route reads the same query string.
- [x] `SoftphoneScreen` rebuilt on the controller through `useSoftphone`: registration and
      call state as text with `data-state` attributes, `data-testid` on every control, a
      Negotiation panel with the ICE, connection, DTLS, codec, candidate pair and packet
      readout refreshed every second while a call is up, and both descriptions behind
      disclosures. The far end's audio is attached from the peer connection's `track` event
      rather than dug out of the receivers after the fact.

### The end-to-end spec

- [x] `e2e/browser-call.spec.ts` with `playwright.config.ts` and `npm run test:e2e`. Two
      Chromium contexts, fake media devices, two tests: the first account calls the second
      and the caller hangs up; the second calls the first and the callee hangs up. Each
      asserts `connected` on both ends, ICE connected or completed, DTLS connected, and after
      two seconds packets both sent and received on both ends. Where the fixture advertises an
      address other than loopback, each browser's selected remote candidate must be that
      address, which is what proves the engine anchored the call rather than declining it.
- [x] Every wait is a predicate over the readout; the only fixed pause is the two seconds
      media is given before its counters are read. The spec fails with a clear message when
      nothing is serving at the API port, and writes a record of each passing test to
      `e2e/results/` with both descriptions, the state history and the final counters from
      each end.
- [x] `e2e/fixture.ts` reads the environment under the names the server's `test/interop/up.sh`
      already exports (`ATHENA_INTEROP_API_PORT`, `_WS_PORT`, `_PUBLIC_ADDRESS`, `_REALM`,
      `_ACCOUNTS`, `_PASSWORD`, `_RESULTS`), with `_PAGE_URL` and `_WS_URL` as overrides. The
      contract was sent to the server's session in full and is in `docs/softphone.md`.
- [x] 26 new tests (84 in all): the controller against a fake user agent through every state,
      the stats summary against a hand-built report, the page contract, and the screen in
      jsdom including auto-register, auto-answer, and the readout appearing on mount and going
      on unmount with the agent stopped.

### The plan, rationalised

- [x] `ACTIVE.md` no longer says the server has no `/api/v1`, no auth and no JSON parsing, or
      that the rebuild is uncommitted; all of that changed on 2026-09-21 and 2026-09-18
      respectively. Milestone 2 now lists the actual differences between `HttpAdminApi` and
      the server's OpenAPI document, found by reading them side by side: the error envelope,
      Subscriber to Account, realms keyed by name, the registration shape, no `/status`, no
      `/media/rtprelay`. Decisions are dated, per the server's convention.

## Rebuild onto macha-client's stack and visual language (2026-09-18)

Committed as `3917df0` and `c69bf62`, merged to `main` as 0.2.0, with `develop` created per
the server's branch policy.

The client was a Create React App scaffold with React Bootstrap, a hand-rolled router and one
failing placeholder test. It is now a Vite + TypeScript application in the same shape as
`../macha-client`, with the API seam the server's admin API plugs into.

### Toolchain

- [x] Create React App removed. Vite 7 + TypeScript 5.9 + Vitest 3, matching macha-client.
      `react-scripts` 5.0.1 was unmaintained and could not render a React 19 tree under its
      own Jest config, which is why the single test in the repository failed.
- [x] Every source file converted to TypeScript, `strict` with `noUnusedLocals` and
      `noUnusedParameters`. Two projects (`tsconfig.app.json`, `tsconfig.node.json`) as
      macha-client does it; `npm run build` typechecks before it bundles.
- [x] Bootstrap and React Bootstrap dropped. The dependency tree went from ~1500 packages to
      167.
- [x] `npm test` (58 tests, 10 files), `npm run typecheck` and `npm run build` all pass.
- [x] Main bundle 92.6 kB gzip, down from 156 kB. JsSIP is code-split behind the softphone
      route, which most sessions never open.
- [x] `.gitignore` covers `build/`, `dist/`, `.vite/` and `.codegraph/`.

### Visual language

- [x] The macha-client design system ported: near-black ground, three layered surfaces, a
      three-step text ramp, glass-blurred sticky navigation, panels, record rows, dialogues.
- [x] Palette in `src/styles/tokens.css`. macha's structure with a blue-steel accent instead
      of its crimson, since the AthenaSIP logo is monochrome and imposes no brand colour.
- [x] The accent marks position, the active nav item, focus, the primary action, and never
      means "good". Green, amber and red are reserved for state, and nothing else uses them.
- [x] Focus ring lifted to a readable steel blue. macha puts its ring at the bottom of the
      accent ramp, which is legible on a television showing one focused thing and is not
      legible on a keyboard-driven form.
- [x] Dark only, with `color-scheme: dark` so form controls and scrollbars follow.
- [x] Contrast pass against the real composited surfaces, not the raw tokens: panels and
      record rows are semi-transparent over the ground, so the background text actually sits
      on is `#101012` to `#171719`. `--text-faint` lifted from macha's `#77777f` (4.03:1 on a
      record row, under AA) to `#8a8a93` (5.23:1 worst), because it labels the readout column
      rather than decorating it. `--focus` raised to `#4d8ec3` to match AthenaPhone; it is
      only ever an outline, border, spinner arc or meter fill, so its bar is 3:1 (WCAG
      1.4.11) and `#3d7fb5` was already clearing it. The state tag colours were checked on
      their own surfaces and clear 4.5:1 with room (6.8:1 to 11.2:1).
- [x] `src/assets/athenasip_small_white.svg` was missing its `xmlns`, so it rendered inline
      but failed as an `<img>`. Added, and the logo now works as an image and a watermark.

### Navigation

- [x] The hand-rolled router is gone: `AppStateProvider`, `HistoryNavigator` and the route
      map in `Main.jsx` are replaced by react-router-dom with `NavLink`.
- [x] The active section and sub-section are now marked. Nothing in the old interface said
      where you were.
- [x] `src/app/routes.ts` names every path once, so a link and the route it reaches cannot
      disagree, which is how `/sip` came to be in the navigation and absent from the route
      table.
- [x] `/sip` resolves (redirects to Realms) instead of silently rendering Home.
- [x] An unknown path renders a Not Found screen instead of the front page.
- [x] Section bars match on a path boundary, so `/mediaserver` is not treated as inside
      `/media`.

### The API seam

- [x] `AdminApi` (`src/api/AdminApi.ts`): the interface for everything this client can ask a
      server to do, written against the plan for "Admin API, part 1" in
      `../athenasip/TODO/ACTIVE.md` before the server built it.
- [x] `HttpAdminApi`: the only file that knows a URL, a verb or a status code exists. Bearer
      token read per request, same-origin `/api/v1` by default, an error envelope decoded
      into a typed `ApiError`.
- [x] `FakeAdminApi`: the same records in memory, enforcing the same rules: duplicate realm
      rejected, realm with subscribers not deletable, subscriber counts kept in step, renames
      carrying their subscribers, port ranges validated. Runs the app in development and every
      screen test.
- [x] `src/api/types.ts` mirrors the planned wire names, snake_case, so a response needs no
      translation layer.
- [x] `errorMessage` never renders `[object Object]` at somebody debugging a SIP server.

### Screens

- [x] **Overview**: node identity, version, uptime in words, registration and call counts,
      datastore/events/media URLs, and every transport with its state.
- [x] **Realms**: the server's list, not the fixtures that used to be hardcoded in the
      component. Add, edit and delete with confirmation, client-side paging, and the conflict
      path (duplicate name, non-empty realm) surfaced rather than swallowed.
- [x] **Subscribers**: per realm, chosen by query parameter so the screen is reachable both
      from a realm row and from the section bar. Add, enable/disable, set password, delete.
- [x] **Registrations**: live bindings with transport, node and expiry, coloured by how close
      to expiry they are.
- [x] **Media** and **RTP Relay**: the engine URL, and an editable relay form that states how
      many concurrent calls a port range actually allows (two ports each, RTP and RTCP).
- [x] **Security**: which transports are carrying signalling unencrypted, which is the
      question AthenaSIP's TLS-first stance makes worth asking. Plus the TLS listener.
- [x] **Diagnostics / Softphone**: the JsSIP proof of concept, moved out of the provisioning
      navigation and rebuilt. The UA is created on connect rather than at module import, the
      effect is no longer keyed on the session (which restarted the agent on every state
      change), the hardcoded SIP URI, password and target are now fields, and the
      `requestAnimationFrame` leak in the two volume meters is fixed.

### Tests

- [x] 58 tests across 10 files, the pattern taken from macha-client: pure logic in the node
      environment, rendering under `@vitest-environment jsdom`, queried by accessible role
      and name.
- [x] Three real defects found by writing them:
      `FakeAdminApi` handed out an id that collided with its own seed data, so deleting a
      created realm deleted a different one; `errorMessage` rendered `[object Object]` for a
      non-Error rejection; the 204 path was untested because the test helper could not build
      a 204 response.

### Documentation

- [x] README rewritten for the new stack and how to run against the fake or a real node.
- [x] `docs/architecure.md` renamed to `architecture.md` (the README linked to a file that did
      not exist) and written. `installation.md`, `quick_start.md`, `configuration.md` and
      `goals.md` filled in; all four were `TBC`.

## Earlier work (Create React App, 2025-02 to 2026-09)

Reconstructed from git history, 6 commits, `3989f28` to `56fc4b7`. Superseded by the rebuild
above, but this is what it established.

- [x] The CRA scaffold, React 19, Bootstrap 5 and React Bootstrap, favicon set for all
      platforms, the AthenaSIP owl logo, GPLv3 licence and docs skeleton.
- [x] The information architecture that survived the rewrite: a fixed navbar, a per-section
      sidebar, and a main panel, with sections for SIP, Media and Security.
- [x] The Realms page as the reference for the whole client: explain the concept with a
      worked SIP identity, then show the table.
- [x] A hand-rolled router (`AppStateProvider` + `HistoryNavigator`) that handled in-page
      clicks, `pushState` and browser back/forward in about 60 lines.
- [x] The JsSIP WebRTC proof of concept, which confirmed end to end that the server's
      WebSocket transport and builtin RTP relay carry a browser call with audio both ways.
