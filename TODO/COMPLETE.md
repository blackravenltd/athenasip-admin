# AthenaSIP Admin - Completed Work

The record of what exists and works in the tree. Move items from `ACTIVE.md` as they land,
with a one-line note on what shipped.

## Rebuild onto macha-client's stack and visual language (2026-09-18)

The client was a Create React App scaffold with React Bootstrap, a hand-rolled router and one
failing placeholder test. It is now a Vite + TypeScript application in the same shape as
`../macha-client`, with the API seam the server's admin API will plug into.

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
- [x] The accent marks position — active nav item, focus, primary action — and never means
      "good". Green, amber and red are reserved for state, and nothing else uses them.
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
      1.4.11) and `#3d7fb5` was already clearing it — the lift is headroom and shared-palette
      consistency, not a fix. The state tag colours were checked on their own surfaces and
      clear 4.5:1 with room (6.8:1 to 11.2:1).
- [x] `src/assets/athenasip_small_white.svg` was missing its `xmlns`, so it rendered inline
      but failed as an `<img>`. Added, and the logo now works as an image and a watermark.

### Navigation

- [x] The hand-rolled router is gone: `AppStateProvider`, `HistoryNavigator` and the route
      map in `Main.jsx` are replaced by react-router-dom with `NavLink`.
- [x] The active section and sub-section are now marked. Nothing in the old interface said
      where you were.
- [x] `src/app/routes.ts` names every path once, so a link and the route it reaches cannot
      disagree — which is how `/sip` came to be in the navigation and absent from the route
      table.
- [x] `/sip` resolves (redirects to Realms) instead of silently rendering Home.
- [x] An unknown path renders a Not Found screen instead of the front page.
- [x] Section bars match on a path boundary, so `/mediaserver` is not treated as inside
      `/media`.

### The API seam

- [x] `AdminApi` (`src/api/AdminApi.ts`): the interface for everything this client can ask a
      server to do, covering the endpoints specified under "Admin API, part 1" in
      `../athenasip/TODO/ACTIVE.md`.
- [x] `HttpAdminApi`: the only file that knows a URL, a verb or a status code exists. Bearer
      token read per request, same-origin `/api/v1` by default, the server's
      `{"message": ...}` error envelope decoded into a typed `ApiError`.
- [x] `FakeAdminApi`: the same records in memory, enforcing the same rules — duplicate realm
      rejected, realm with subscribers not deletable, subscriber counts kept in step, renames
      carrying their subscribers, port ranges validated. Runs the app in development and every
      screen test.
- [x] `src/api/types.ts` mirrors the server's own types with the wire names, so a response
      needs no translation layer.
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
