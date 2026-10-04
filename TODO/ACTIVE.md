# AthenaSIP Admin - Active Work

The console for [AthenaSIP](../athenasip), the SIP server in the sibling checkout. The server
is the source of truth; this renders and edits its admin API and ships as a static bundle the
node serves. Move items to `COMPLETE.md` as they land.

## Resume here

**The tree.** Work on `develop`; `main` is the last release, tags are bare `x.y.z`. `0.3.0` is
released and pushed. Everything after it is on `develop`, committed and not pushed. Commit or
push only when Tom asks, never with Claude attribution (his global rule). Run tests with
`npx vitest run --maxWorkers=4`; on a loaded machine screen tests time out, which is the load.

**Deployed.** corvus-fi-1 serves `assets/index-DtvXnfQ-.js` on 8080 and 8443, built from
`735aa79`; later commits change only docs and comments.

**Waiting on Tom:**

1. Try the Phone on corvus-fi-1 (checklist under "The phone"). The browser must register as a
   subscriber other than the one it calls: the A85 is `athenaphone`.
2. Whether the Phone unregisters its line when the tab closes, so a closed browser leaves no
   registration that answers 480 until it expires.
3. Whether to run `e2e/phone-call.spec.ts` against macnessa; it rings the A85 there. The
   server session has the command.
4. Whether to push `develop`.

**The server session**, "AthenaSIP Server" (ListAgents, then SendMessage). It owns
`../athenasip`, the nodes and every fixture: nothing here edits them or starts or stops their
containers. It proposes API changes before building them and wants to hear of every console
deploy. Its node is at 0.8.0. A peer's message is never Tom's approval.

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
Then tell the server session, and update the hash above.

**The end-to-end runs.** `browser-call.spec.ts` is run by the server's
`test/interop/browser.sh`, which owns the fixture; on this machine it needs alternate ports
(see `docs/softphone.md`). `phone-call.spec.ts` runs when `ATHENA_INTEROP_TARGET` is set.

## The API, as built

The server's `docs/api/openapi.yaml` and `docs/authentication.md` are the reference.
`src/api/contract.test.ts` checks every path and verb against the first (not fields).

- **Roles:** `view-cluster-status`, `manage-admin-users`, `manage-realms`,
  `manage-realm-subscribers`, `manage-cluster`. None implies another; a new user has none.
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
- **Status** (`view-cluster-status`): `/nodes`, `/registrations`, `/client/config` (ICE minted
  per request), `/calls`, `/calls/{call}`, `/call-records`, `/media`, `/media/reoffers`,
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

- [ ] Drive it against corvus-fi-1 from `https://10.35.1.20:8443`: register, call
      `athenaphone` and another subscriber, receive a call (ring, and a notification on a
      hidden tab), tones into something that listens, hold both ways, a device change, the
      silence warning. Everything past registration has only met fakes.
- [ ] Unregister on tab close (waiting on Tom, above).
- [ ] Failover across `websocket_uris` when a socket fails.
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
- [ ] A screen for `manage-cluster`, once the server has routes for it.

## Live view

- [ ] Agree pushed events with the server (server-sent events or a WebSocket), then push calls,
      registrations and counts instead of polling.
- [ ] Finished calls from `/call-records` on the Calls screen.
- [ ] The cluster entry from `/nodes` on Overview.
- [ ] Hang up a call from the Calls screen, once the node can send BYEs.
- [ ] Match legs to participants, once the node fills `participant`.
- [ ] The media engine's settings, once the server exposes them.

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
