# AthenaSIP Admin - Completed Work

The record of what exists and works in the tree. Move items from `ACTIVE.md` as they land,
with a one-line note on what shipped.



## Documentation and comments (2026-10-04)

- [x] **Rationalised.** The README and `docs/` rewritten short and current, for an installer
      or contributor, covering the Phone. Code comments cut to what the code does not say,
      with no history; compiled output is identical before and after.
## The phone (2026-10-03, uncommitted at the time of writing)

- [x] **In-call controls in the controller.** `mute`, `hold` (and the far end's hold, as
      `heldByFarEnd`), `sendDtmf` as RFC 4733 telephone events in the media, and `CallMedia`
      for video and the microphone and camera by `deviceId`. `summarise` reads the sent
      microphone's accumulated energy from the `media-source` record, for a silence warning.
- [x] **The Phone section.** `/phone`, in the top bar for any signed-in user (a user with no
      roles too). `PhoneHost` is loaded on demand and held by the shell from first opening
      until sign-out, so a call, its audio and a top-bar indicator outlive a change of screen.
      Sign in to a line (SIP address, password, WebSocket from `/client/config`), a dial pad
      that dials an extension in the line's own realm and sends tones on a call (keys typed
      too), Call and Video call, Answer, Answer with video, Decline (603), Mute, Hold, the
      far end's hold, a call timer, video panes, and the readout as "Call details". The SIP
      address and WebSocket are remembered (`src/phone/settings.ts`), never the password.
- [x] **Ringing.** A British double ring for an incoming call and a quieter ringback while
      the far end rings, made with oscillators (`src/phone/ringing.ts`, no sound file). A
      browser notification for a call arriving while the tab is hidden, once allowed from
      the Phone screen; closed when the call stops ringing.
- [x] **Devices.** "Allow the microphone" (and camera) before signing in to a line, so a
      permission change, which reloads the page in Chrome, never interrupts a call or loses a
      typed password. Then microphone, camera and speaker (`setSinkId`, where the browser has
      it) choices, remembered, used from the next call. The call's own microphone and the far
      end are metered from the streams the call carries, and a connected, unmuted call whose
      sent energy has not grown for five seconds says it is sending silence (BlackHole, on the
      first live call). This closes the first live call's findings for the Phone; the harness
      view keeps its plain controls.
- [x] **History and directory.** `listCallRecords` (`GET /call-records`, `view-cluster-status`)
      in the client, the fake and the contract test. Beside the dialler, this line's recent
      calls from the records (outgoing, incoming, missed, duration, when), re-read as each call
      ends, and the realm's subscribers with whether each is registered; each with a Call
      button. Read with the console user's roles: without them the panel says which role it
      needs, and with only `view-cluster-status` the directory lists who is registered now.
- [x] **The Phone without View cluster status.** It asks `/client/config` for nothing, so no
      403s: the WebSocket is a guess, calls have no ICE servers, and the page says both.
- [x] **The phone run.** `e2e/phone-call.spec.ts`: one page calls a phone (`ATHENA_INTEROP_TARGET`)
      with Chromium's fake camera, and asserts ICE, DTLS, audio both ways, the video line
      accepted or bundled, and frames decoded from the phone. The harness page takes
      `video=1`, and the readout gains `video()` and the video counters in `stats()`. For the
      server's run against macnessa and the A85; not yet run.
## The softphone's meters and secure context (2026-10-03)

- [x] **Video, when asked.** A "Video" box beside Call on the console's softphone (not the
      harness page, which stays audio only) sends the camera on calls placed and answered.
      The far end's picture and this browser's own show beside the call; the readout gives
      each end's video m-line (port and direction, or "declined (port 0)") and the video's
      own packet, frame and codec counts, kept apart from the audio's. First live video call
      the same evening, console at `https://10.35.1.20:8443` as 1001 to AthenaPhone: video and
      voice both ways, VP8 and opus, no tunnel. A bundled line's placeholder port 9 now reads
      "bundled".
- [x] **The Far end meter reads the remote stream.** It used `createMediaElementSource` on the
      `<audio>` element, which works once per element, and restarted on every render (once a
      second, as the stats arrive), so it went dead within a second of a call connecting. It
      now reads the stream with `createMediaStreamSource` and restarts only for a new stream.
- [x] **wss on https, ws on http.** The console's softphone takes `websocket_uri` on an
      https page and the `ws` transport on an http one (`signallingUri`), so a page over http
      does not depend on the browser trusting the node's certificate.
- [x] **No secure context, said plainly.** Over plain http to a non-local address the browser
      gives no microphone; the softphone says so and disables Register.

## "Account" names nothing (2026-10-03)

- [x] **One vocabulary.** Per Tom and the server's `docs/glossary.md`: the type, the
      `AdminApi` methods, the fake and every screen say subscriber; the signed-in user's own
      page is `MeScreen` at `/me`, headed "You". The fake's messages read as the node's do
      ("no such subscriber"). `ATHENA_INTEROP_ACCOUNTS` became `ATHENA_INTEROP_SUBSCRIBERS`
      on both sides, the server's first.

## Subscribers route, realm delete and rate limits (2026-10-03)

- [x] **`/realms/{realm}/subscribers`.** Renamed from `/accounts` in `HttpAdminApi`, with no
      alias, following the server's document; the contract test checks it there.
- [x] **Deleting a realm deletes its subscribers.** The fake removes them and their
      registrations, and the delete dialogue says they go with it instead of warning that
      they stay behind.
- [x] **`subscriber` fields.** Registrations carry `subscriber` and `subscriber_id`, and the
      re-offer and qualify lists `subscriber`, renamed from `account` with the route.
- [x] **429 everywhere.** Any rate-limited request reads "The node is limiting requests. Try
      again in N seconds."; it never signs out, and the Calls poll holds for Retry-After (10
      seconds when the node names none) before reading again.

## Realm and account behaviour (2026-10-02, uncommitted at the time of writing)

- [x] **Media settings inherit.** The realm's `media_anchor` and `media_profiles` became
      `behaviour: {media_anchor, media_profile}`, null for inheriting the server's `behaviour:`
      section, with `behaviour_effective` beside it. Each setting is a select with "Server
      default" first, which sends null, naming the server's value from `behaviour_default`
      (server `89e97de`); a new realm inherits every setting and takes the defaults' names
      from any listed realm. Rows mark an inherited setting "(server default)". The fake
      validates as the node does: a 400 changes nothing, and the old top-level fields have
      "moved into the behaviour section". `mirror` is described as offering the callee what
      the caller offered.

- [x] **A subscriber's media profile.** Accounts gained `behaviour: {media_profile}` (server
      `fdac9a4`), null for the realm's. Adding a subscriber and the row's Media dialogue offer
      it, with "Realm default (X)" first from the realm's `behaviour_effective`; a row shows a
      tag only for the account's own setting. A password change sends no behaviour, and a
      media change sends no password.

- [x] **Probing, re-offers and the cluster** (server `798c50d`). A realm's `qualify_interval`
      is a field on the realm form, empty for the server's, 0 for never, otherwise 5 to 86400;
      a realm row says when it probes. The Registrations screen lists `GET /qualify`: each
      probed client, whether it answers, and the media it said it takes. The Media screen lists
      `GET /media/reoffers`, with a button that sets the account's profile to the suggestion
      (needs Manage subscribers; nothing sets it automatically). The Overview lists every node
      from `GET /nodes` with its status and version, a stale report shown as not trusted.

- [x] **Contact rewriting** (server `de478c5`). A realm's `rewrite_contact` is a select on the
      realm form, "Server default (off)" first, then On and Off, labelled as the server
      suggested; a realm row says when it is on.

## Live calls and the media engine (2026-10-01, uncommitted at the time of writing)

- [x] **Calls screen.** `GET /calls` (server `02a3340`), read every two seconds: from, to,
      state, duration, engine, and each leg's cumulative packets and bytes in both directions.
      A direction the engine does not count says so rather than showing 0. One-way audio is
      flagged when a direction stands still between readings while another in the call moves.
      Needs `view-cluster-status`.
- [x] **Media engine panel.** `GET /media` on the Media screen: the engine, whether it is
      connected, and its capabilities. Media is now open to `view-cluster-status` as well as
      `manage-realms`, and each panel says quietly when the login lacks its role.
- [x] **Token sign-in removed** (Tom's decision, 2026-10-01). The node drops `http.api.tokens`
      and has no setup token; the first user and recovery are `athenasip --add-user` on the host.
      The sign-in page has only username and password, a 404 from the login says the node is too
      old rather than offering a token, `SessionInfo` has no `kind` and always names a user, and
      the client's role guessing for nodes without `/session` is gone, as are the fake's tokens.
- [x] **The browser spec signs in.** With configured tokens gone (server `dd94d8c`), the relay
      phase signs in as `ATHENA_INTEROP_API_USER` / `_PASSWORD`, which `up.sh` generates per
      run, reads `/client/config` and signs out. The user is kept out of the results record.
      The server session ran `browser.sh --relay` against it on 2026-10-01: both tests passed.
- [x] **`getCall`** is in the client and the fake, with a Call-ID's `/` sent as `%2F`. No
      screen uses it yet.

## Aligned with the built server (2026-09-30, uncommitted at the time of writing)

- [x] **The auth and users routes, as built.** 409 `would_lock_out` for disabling, demoting or
      deleting yourself (a configuration token is nobody and exempt); 400 `unknown_role`; 403
      `wrong_password`, which neither signs out nor re-reads roles; a password change ends every
      session of that user, so the Account screen signs you out and says why; 503 `unavailable`
      is never a sign-out, and the sign-in screen says a configuration token still works.
- [x] **The contract test reads a complete document.** `PENDING` is empty against the server's
      `03ebd0f`; every request the client makes is described.
- [x] **Client provisioning.** `GET /client/config` (server `e5a752d`): the console's softphone
      signals at `websocket_uri` and fetches ICE servers per call, dropping a TURN entry with no
      credential or an expired one. The harness page is unchanged.
- [x] **A relayed call, proven.** The console softphone's "Relay only" option sets
      `iceTransportPolicy: "relay"`. Against the server's docker stack, with rtpengine on its
      bridge address, two browsers carried audio both ways through coturn (about 400 packets
      each way, 0 lost, `totalAudioEnergy` above 2), and the harness page with no ICE servers
      failed there as expected. Chrome labels the relayed local candidate `prflx` with a
      `relayProtocol` once checks run; the port is coturn's.
- [x] **The relay in the automated browser layer.** Option B: coturn in the server's interop
      fixture (`d015202`, `browser.sh` both phases at `8e55956`). The page takes `ice` and
      `relay=1`; the spec runs relayed when the engine advertises its bridge address and
      asserts each pair's local port inside coturn's range. First run: direct 2 passed, relayed
      2 passed, both local candidates reported `prflx`, so the port was the only assertion
      that would have held.

## Users, roles and a login (2026-09-25, uncommitted at the time of writing)

The server's admin authentication is specified in `../athenasip/docs/authentication.md`
(committed there as `3900b1c`) and not yet built on the node. The console is built against it
now, agreed point by point with the server's session, and falls back to the node as it is.

- [x] **The model.** A user is somebody, or some system, that uses the API, of which the
      console is one client. A subscriber is something registered on a realm to make and
      receive calls; the API calls it an account. Neither is ever made from the other. Five
      roles, and nothing implies anything else, including no superuser: `view-cluster-status`,
      `manage-admin-users`, `manage-realms`, `manage-realm-subscribers`, `manage-cluster`. A
      user can hold none, which is the default for a new one.
- [x] **Signing in.** A username and password, `POST /auth/login` to a token and an expiry,
      then `GET /session` for who it is. A configuration token from `http.api.tokens` is the
      other way in, for the first user on a fresh node and for recovery, and is shown as one
      rather than as a person. A node that answers the login with 404 predates user logins, and
      the console moves to the token path and says why. One message for a wrong password and a
      disabled user, as the node gives one answer for both. A 429 says how long to wait.
- [x] **The session.** In memory only. Ends itself at the node's expiry, and on any 401 with
      the reason shown on the sign-in screen. A 403 re-reads `GET /session`, so a role removed
      mid-session takes its screens out of the navigation at once. Log out ends the session on
      the node as well as in the page. In its last five minutes the top bar counts down, with a
      live region that announces once rather than every second; the account screen says when
      the session ends, or that a configuration token does not. `src/auth/SessionExpiry.tsx`.
- [x] **Role-aware navigation.** What the roles permit is shown and the rest hidden; a screen
      reached directly says which role it needs. A user with no roles sees a No permissions page
      naming who they are signed in as and what to ask for, not an empty console. The SIP
      section root lands on the first screen the roles allow.
- [x] **Users screen** for `manage-admin-users`: list with roles, disabled state and last
      sign-in; add with roles ticked explicitly, none by default; edit display name, roles and
      disabled; set a password; sign a user out everywhere; delete. You cannot disable yourself,
      remove your own `manage-admin-users` or delete yourself, which the node also refuses.
- [x] **Your account** at `/account`: who you are, your roles, and changing your own password
      with the old one.
- [x] **Subscribers.** The realm accounts screen is called Subscribers, at `/sip/subscribers`,
      and says a subscriber is not a user. The type and the API path stay `Account`.
- [x] **Against today's node.** No `/auth/login` and no `/session`, so the token path runs: an
      `admin` config token is treated as every role and a `client` token as reading status,
      found by probing `/realms` and `/nodes`.
- [x] `FakeAdminApi` enforces the specification: seeded users whose password is their username
      (`admin` all roles, `ops` status, `helpdesk` subscribers, `newhire` none, `former`
      disabled), sessions that re-read roles on every request, case-insensitive usernames,
      configuration tokens, and the self-protection rules. Signing a user out everywhere is 204
      with or without sessions and 404 for no such user, as agreed with the server.
      `src/test/signedIn.ts` gives a test a signed-in node.
- [x] Driven in headless Chromium: each seeded user lands where its roles say, the
      configuration token signs in, the Users screen renders, and there are no page or console
      errors.
- [x] 149 tests. The contract test lists the auth and users routes as pending, and fails once
      the OpenAPI document has them, so that it says to take them out.

This replaced an earlier attempt the same day at roles as scopes (`admin`, `users`, `status`,
`client`, with admin implying the rest). The server's user decided there is no admin scope and
nothing implies anything, and the scope proposal was folded into the design above.

## Against the server's API (2026-09-25, uncommitted at the time of writing)

The client had been written against the plan for the server's admin API rather than the API it
built. It now speaks `../athenasip/docs/api/openapi.yaml`, version 1, and every behaviour the
document leaves open was read from the server's handlers rather than guessed.

- [x] **The wire format.** The error envelope is `{"error": {"code", "message"}}` and is read as
      such. Subscriber is Account, at `/realms/{realm}/accounts/{user}`. A realm carries its
      registration and media policy, and is addressed by name. A registration is the server's
      shape, with Unix-second times. There is no `/status` and no `/media/rtprelay`, so the
      Overview is built from `/health` and `/nodes`, and the RTP Relay screen is gone.
- [x] Realms and accounts are keyed by name and user, never by id. The server's ids are 64-bit
      and a JavaScript number rounds them.
- [x] `health()` answers a degraded node, which is a 503, with its body rather than as a
      failure, because that is exactly what the Overview has to show.
- [x] **Screens.** Realms add and edit the registration limits, the nonce lifetime and the
      media policy, and refuse a shortest registration longer than the longest, which the
      server would accept and every phone would then be refused by. A realm cannot be renamed.
      Subscribers add, set a password and delete. Media edits each realm's media policy in
      words. Security and TLS read the node list. Registrations show transport, NAT, node and
      path. The Overview says quietly what a login cannot see rather than failing in red.
- [x] **Field-level errors.** A `conflict` on a create is shown against the name field.
- [x] Deleting a realm warns that its subscribers outlive it, because the node removes only the
      realm today. Whether it should cascade is the server's user's decision.
- [x] `src/api/contract.test.ts` checks every request `HttpAdminApi` makes against the OpenAPI
      document in the sibling checkout, and skips without it.
- [x] Dialogues render into the document body. The main panel is a stacking context of its own,
      so a dialogue in it could never rise above the sticky navigation, which covered the title
      of the realm dialogue. Found by driving every screen in headless Chromium.
- [x] **Deployed to corvus-fi-1.** The node serves the console from
      `/usr/local/share/athenasip/admin` in SPA mode; a new build is live as soon as rsync
      finishes. Deployed once by the server's session and once from here, before the users and
      roles work. The softphone defaults to WebSocket port 8088, which that node serves.

## Audio, not only packets (2026-09-25, uncommitted at the time of writing)

The last open item of the softphone's own milestone. The server's Milestone 3 has one item
left, a browser to an AthenaPhone on a real device, which is manual and the server's to run.

- [x] The readout's `stats()` carries the far end's accumulated `inbound-rtp.totalAudioEnergy`,
      and the browser spec asserts it above zero at each end. An instantaneous `audioLevel`
      could land in the gap between the fake device's beeps; an accumulator cannot. Run by the
      server's `browser.sh` on alternate ports, both tests passing in 11.4 seconds.

| Test | End | Sent | Received | Lost | Energy | Remote candidate |
| --- | --- | --- | --- | --- | --- | --- |
| 1001 calls 1002, caller hangs up | 1001 | 105 | 105 | 0 | 0.412 | 10.35.1.132:23010 |
| | 1002 | 111 | 109 | 0 | 0.549 | 10.35.1.132:23000 |
| 1002 calls 1001, callee hangs up | 1002 | 117 | 117 | 0 | 0.469 | 10.35.1.132:23002 |
| | 1001 | 123 | 120 | 0 | 0.571 | 10.35.1.132:23000 |

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
