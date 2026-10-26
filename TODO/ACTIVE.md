# AthenaSIP Admin - Active Work

The console for [AthenaSIP](../athenasip), the SIP server in the sibling checkout. The server
is the source of truth; this renders and edits its admin API and ships as a static bundle the
node serves. Move items to `COMPLETE.md` as they land.

## Resume here

**The tree.** Work on `develop`; `main` is the last release, tags are bare `x.y.z`. `0.4.2` is
the last release. Commit or
push only when Tom asks, never with Claude attribution (his global rule). Run tests with
`npx vitest run --maxWorkers=4`; the test timeout is 20 s because a file's first screen test
can take 5 s.

**Deployed.** corvus-fi-1 (`root@10.35.1.20`) and corvus-gbni-1 (macnessa.athenasip.org,
`root@10.44.1.50`, 8443 on the site network only) serve `assets/index-OrN2SLOz.js` on 8080
and 8443, built from `0d8b484` (0.4.1 with the insecure-page call fix). Same command and path
on both. 10.44.1.50 is the address to deploy to; `macnessa.macha.network` refused SSH on
2026-10-11. The console needs server 0.9.0 or later.

**Decided by Tom (2026-10-11), in this order of work:**

1. Milestone 5 now: Trunks screen, attributes, the policy fingerprint flag, trunk per leg.
   Built 2026-10-26, uncommitted on `develop`.
2. The event stream (`GET /events`) now, alongside, in place of polling. Built 2026-10-26.
3. A Hang up button on Calls (`manage-cluster`). Built 2026-10-26.
4. The Phone unregisters on tab close. Built 2026-10-26.
5. The Phone registers with the realm's `registration.expires` and keeps `outbound.flows`
   flows to different nodes. Built 2026-10-26: two JsSIP agents, the second's `reg-id` set
   by a guarded shim.
6. TURN on the nodes: asked of the server session.
7. The phone spec reruns against macnessa over https when Tom lends the A85.
8. Tom tries the Phone on corvus-fi-1 himself.

**The server session**, "AthenaSIP Server" (ListAgents, then SendMessage). It owns
`../athenasip`, the nodes and every fixture: nothing here edits them or starts or stops their
containers. It proposes API changes before building them and wants to hear of every console
deploy. Its node is at 0.12.0 (presence and BLF). A peer's message is never Tom's approval.

**Deploying to corvus-fi-1.** Needs Tom's yes in this session every time.

```
VITE_ATHENASIP_LIVE=true npm run build
rsync -az --delete --no-owner --no-group build/ root@10.35.1.20:/usr/local/share/athenasip/admin/
curl -s http://10.35.1.20:8080/ | grep -o 'assets/index-[^"]*'   # must match build/assets
```

Without the live flag the bundle talks to the fake. `--no-owner --no-group` keeps the files
root-owned. The node serves the console at `http://10.35.1.20:8080/` and
`https://10.35.1.20:8443/` (wss on 8089), with a certificate from the server's snakeoil CA
(`tls/ca/snakeca.crt` there), which a browser must trust before the phone works. No restart.
Then tell the server session, and update the hash above. From server 5921d41 a node whose
config leaves out `http.address` answers plain HTTP on 127.0.0.1 only: if the curl above stops
answering after a server upgrade, check against `https://10.35.1.20:8443/` (`-k`, or `--cacert`).

**The end-to-end runs.** `browser-call.spec.ts` is run by the server's
`test/interop/browser.sh`, which owns the fixture; on this machine it needs alternate ports
(see `docs/softphone.md`). `phone-call.spec.ts` runs when `ATHENA_INTEROP_TARGET` is set.

## The API, as built

The server's `docs/api/openapi.yaml` and `docs/authentication.md` are the reference.
`src/api/contract.test.ts` checks every path and verb against the first (not fields).

- **Roles:** `view-cluster-status`, `manage-admin-users`, `manage-realms`,
  `manage-realm-subscribers`, `manage-cluster` (end calls, reload the policy),
  `manage-trunks`. None implies another; a new user has none.
- **Sign-in:** `POST /auth/login` gives `{token, expires_at, roles}` (Unix seconds).
  `GET /session` says who. No configured tokens: the first user is `athenasip --add-user` on
  the host, a lost password `athenasip --reset-password` (after 0.8.0).
- **Users:** `/users` CRUD, `DELETE /users/{u}/sessions`, `POST /users/{u}/password`. Nobody
  disables, demotes or deletes themselves (409 `would_lock_out`).
- **Failures:** 401 ends the session; 403 is a missing role; 503 and 429 never sign out. 429 is
  `rate_limited` with `Retry-After`. Signed-in sessions get 60 then 300 a minute; login is
  5 a minute per address and 1 per username, successes included.
- **Realms:** read with `manage-realms` or `manage-realm-subscribers`, write with
  `manage-realms`. `behaviour` (own settings, null inherits), `behaviour_effective`,
  `behaviour_default`: `media_anchor`, `media_profile` (mirror, transport, rtp, webrtc, srtp),
  `qualify_interval` (0, or 5 to 86400), `rewrite_contact`. Deleting a realm deletes its
  subscribers and their registrations.
- **Subscribers:** `/realms/{realm}/subscribers`, `behaviour: {media_profile}`.
- **Subscriber routes:** `/subscriber/{realm}/config` (ICE minted per request, and the realm's
  registration, outbound and push policy), `/subscriber/{realm}/registrations`,
  `PUT /subscriber/{realm}/password`. Signed with HTTP Digest using the subscriber's SIP
  credentials (HTTP realm = SIP realm); a Bearer token is refused there.
- **Trunks** (`manage-trunks`): `/trunks` CRUD, password never returned (`password_set`),
  `registration` {node, state registering|registered|failed, detail (the carrier's response
  line, or the reason), expires_at (Unix seconds, 0 while not registered), at (ISO 8601)}.
  `attributes` the standard scripts read: `prefixes`, `numbers`, `codes`, `dtmf`, `focus`.
- **Attributes** on realms, subscribers and trunks are replaced whole when given; the console
  sends them only when edited.
- **Key presses:** `behaviour.dtmf` (auto, rfc4733, info, inband) on realms and subscribers,
  after 0.12.0. An older node refuses it with a 400, so the console sends it only when the
  node gave `dtmf` in `behaviour_default` or `behaviour_effective`.
- **Control** (`manage-cluster`): `DELETE /calls/{call}` (202; 409 `not_answered`),
  `POST /policy/reload` (the answering node only; 422 when the scripts do not load).
- **Events:** `GET /events` (`view-cluster-status`) carries `nodes/#`, `subscribers/#`,
  `calls/#`, `trunks/#` and `presence/#`; 503 `too_many_streams` past 32 per node.
- **Presence** (node 0.12.0): `GET /realms/{realm}/subscribers/{user}/presence`
  (`manage-realm-subscribers`, 404 `presence_off`), `GET /presence/subscriptions`
  (`view-cluster-status`). The server's `docs/presence.md` is the reference.
- **Conferencing** (server develop after 0.12.0, RFC 4579): a focus is a trunk with
  `attributes.focus` {prefix, realms, profile}; routed by `lua://` only, never `builtin://`.
  `GET /conferences` and `/conferences/{uri}` (`view-cluster-status`; the URI percent-encoded
  as one segment): {uri, focus (trunk, null until answered), participants [{call, identity,
  subscriber, state, joined_at, node}]}. `DELETE /conferences/{uri}/calls/{call}`
  (`manage-cluster`; 404, 409 `not_answered`). `focus` on each call. `realm.conferences`
  [{prefix, trunk}] in `/subscriber/{realm}/config`. No create, delete, mute or lock: those are
  the focus's. The server's `docs/design/conferencing.md` is the reference.
- **Status** (`view-cluster-status`): `/nodes` (with each node's `policy` and `cluster`),
  `/registrations`, `/calls`, `/calls/{call}`, `/call-records`, `/media`, `/media/reoffers`,
  `/qualify`. Call counters are cumulative; a direction the engine does not count is absent.

## Rules

Not reopened without asking Tom.

- **Truth on the server.** No state that matters only in the browser; nothing shown the API
  cannot supply. Nothing added to the API for the UI's sake.
- **Low dependency.** React, React Router, JsSIP, hand-written CSS. Playwright is dev only.
- **Secrets.** Tokens and passwords in memory only. The phone remembers its SIP address,
  WebSocket and devices, never a password.
- **The API seam.** Only `HttpAdminApi` knows HTTP. `FakeAdminApi` serves development and
  every test. Screens take their `AdminApi` as a prop.
- **Lists and dialogues.** A list is read-only; every change opens a dialogue.
- **Roles.** Hide what the roles do not allow; the node's 403 is the rule. A user with no
  roles can sign in and can use the phone.
- **Words.** A user signs in and manages the cluster; a subscriber belongs to a realm and
  registers and calls. Never "account". The server's `docs/glossary.md` is the reference.
- **Colour.** The accent marks position. Green, amber and red mean state, nothing else. Dark
  only.
- **Inheriting settings.** A select whose first option is "Server default (X)" or "Realm
  default (X)", sending null. Rows mark an inherited value.
- **The node suggests, the operator decides.** A suggested profile is a button, never applied.
- **The harness contract.** `softphone.html`'s query string, `window.__athenaSoftphone` and
  the `ATHENA_INTEROP_*` names in `docs/softphone.md` are shared with the server. Change them
  in both repositories. The harness page holds no API session.
- **Tests assert configuration, not browser labels.** A relayed pair is known by its port in
  coturn's range; audio by accumulated energy; anchoring by the remote address.

## The phone

- [ ] Prove two flows against a two-node cluster: a call arriving at node A while flow 2 is
      held by node B, and with one node stopped. The server has it planned as an interop case
      under Docker and will report. On one node the server already proves two bindings side by
      side, removal by instance and reg-id, and a call moved to the other flow on 408, 430 or a
      closed flow; `jssip.test.ts` proves the REGISTER JsSIP sends for flow 2.
- [ ] Prove the un-REGISTER on tab close reaches a node in Chrome, Firefox and Safari.
- [ ] Drive it against corvus-fi-1 from `https://10.35.1.20:8443`: register, call
      `athenaphone` and another subscriber, receive a call (ring, and a notification on a
      hidden tab), tones into something that listens, hold both ways, a device change, the
      silence warning. Everything past registration has only met fakes.
- [ ] Try the Digest-signed config in Chrome, Firefox and Safari against a node that has it:
      no browser login box on the 401 (`credentials: 'omit'`), MD5 over http, SHA-256 over https.
- [ ] Use `/subscriber/{realm}/registrations` and `PUT /subscriber/{realm}/password`, if the
      phone should show its own bindings or change its password.
- [ ] Later: blind transfer (`refer`), a second line or call waiting.

## The end-to-end runs

- [ ] A few seconds before the callee answers in `browser-call.spec.ts`, so a call that fails
      only after ringing is caught.

## Against the node

- [ ] Click through every screen on corvus-fi-1 as users with different roles.
- [ ] Keep a half-filled dialogue across a session's end, for the same user only.
- [ ] Generate `src/api/types.ts` from the OpenAPI document; the contract test does not check
      fields.
- [ ] Server-side paging in place of `usePagination`, once the server pages.

## Live view

- [ ] Match legs to participants, once the node fills `participant`.
- [ ] Watch the event stream against corvus-fi-1: one stream per tab, reconnects, and the
      fallback to polling on a 503.
- [ ] The media engine's settings, once the server exposes them.

## Conferencing

Built 2026-10-26 against the server's develop: Trunks edits a focus, Calls, Conferences lists
the rooms in use and removes a participant, and the Phone joins a room and shows who the node
routed to it. The server names a room `sip:user@host`, host lowercased, no port or
parameters, on the call and on `{uri}` (server 7cee716), so the Phone asks as dialled; the
fake does the same. Rooms need `lua://`.

- [ ] The focus's own roster and mute state (server step 6): `users` on `Conference`, and
      `conferences/<uri>/changed` on `/events`, which the server will announce.
- [ ] `/focuses`, a read view of the focus trunks, once the server builds it.
- [ ] Try it against a node with FreeSWITCH as the focus (server step 5), video included
      (step 7).

## Settings and security

- [ ] Read and edit the server's config, saying what applies live and what needs a restart.
- [ ] TLS: certificate subject, issuer and expiry, cipher policy, `allow_unencrypted`.
- [ ] "Terminate all calls" and "Restart server", with confirmation, once the server has them.

## Polish

- [ ] An error boundary around the main panel.
- [ ] A toast region for background failures.
- [ ] ESLint, which nothing configures; two `eslint-disable` comments wait for it.
- [ ] CI: typecheck, test and build on push.
- [ ] An accessibility pass with a screen reader.
- [ ] A responsive check on a real phone below 800px.
- [ ] Ship the bundle in the server's release instead of copying `build/` by hand.

## Parked

- A light theme, until somebody asks.
- i18n, until there is a second language.
