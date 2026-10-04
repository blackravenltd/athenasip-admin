# AthenaSIP Admin - Completed Work

What exists and works, by release. The commit history has the detail.

## Unreleased (on `develop`)

- **The Phone.** A top-level browser phone for any signed-in user, held by the shell so a call
  outlives a change of screen: dial pad and tones, audio and video, answer, decline, mute,
  hold, ringing and notifications, device choice, a silence warning, recent calls from
  `/call-records` and a realm directory. Remembers everything but the password, and reads
  nothing its user's roles do not allow.
- **The phone run.** `e2e/phone-call.spec.ts` calls a real phone with video and asserts the
  media. The harness page takes `video=1`, and the readout gains `video()`.
- **Password recovery** named on the sign-in page: `athenasip --reset-password`.
- **Docs and comments** rewritten short and current.

## 0.3.0 (2026-10-03)

- **Sign-in and users.** Username and password, five roles, role-aware navigation, a Users
  screen, your own page at `/me`, session expiry warning. No configured tokens.
- **Realms and subscribers** with inheritable behaviour: media anchoring and profile, OPTIONS
  probing, contact rewriting; a subscriber's own media profile.
- **Live view.** Calls with per-leg rates and one-way audio flagged; the media engine and its
  re-offers; probed clients; the cluster on Overview.
- **Node 0.8.0.** `/subscribers`, cascading realm delete, rate limits handled everywhere.
- **The softphone.** ICE and WebSocket from `/client/config`, wss from https, video, a working
  far-end meter, a plain message when the page is not a secure context.
- **The relay phase** of the browser-to-browser run, through coturn.

## 0.2.0 (2026-09-23)

- **Rebuilt** on Vite, TypeScript and Vitest with macha-client's visual language, against the
  server's admin API through `AdminApi`, with an in-memory fake for development and tests.
- **The softphone** as a driveable controller and harness page (`softphone.html`), and the
  first browser-to-browser call through AthenaSIP and rtpengine.

## Before 0.2.0

A Create React App prototype against hardcoded fixtures, replaced by the rebuild.
