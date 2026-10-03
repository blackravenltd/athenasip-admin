# AthenaSIP Admin - The softphone, and the end-to-end run

The softphone is a WebRTC endpoint over SIP: it registers one account against one node over
the WebSocket transport, places or answers one call, and says exactly what happened while
doing it. It is a diagnostic in the console, under Diagnostics, and it is the browser end of
AthenaSIP's end-to-end run, on a page of its own.

## Two pages, one component

`SoftphoneScreen` is served twice from the same build:

- `/diagnostics/softphone` in the console, for an operator proving a node by hand.
- `/softphone.html`, a second Vite entry with no console around it and no router. It is a
  plain file, so the node's static middleware serves it with no history fallback, and it is
  what the end-to-end run opens.

They differ in one thing. The console's page asks the node's `GET /api/v1/client/config`
where to signal and what to use for ICE: `websocket_uri`, when the node has a `wss` listener,
replaces the guessed default socket, and the ICE servers are fetched again as each call is
placed or answered, because a TURN credential is minted per request and expires. A `turn:`
entry that arrives without a credential is dropped rather than handed to the browser half
built (`src/softphone/iceServers.ts`). The harness page takes no API and changes nothing:
its socket comes from the query string and it uses no ICE servers, so the contract below is
untouched.

Underneath both is `src/softphone/Softphone.ts`, which owns the JsSIP user agent and session
and has nothing of React in it. It publishes an immutable snapshot after every change: the
registration and call state, the session descriptions each end saw, the ICE and DTLS state,
the candidate pair the browser settled on and the packet counters. A screen renders the
snapshot and a harness reads it, through one interface. JsSIP is injected through `SipStack`
(`src/softphone/jssip.ts`), so the controller's tests drive it with a user agent that never
opens a socket.

## The query string

Either page can be opened already knowing what to do. All values are URL-encoded.

| Parameter | Meaning |
| --- | --- |
| `ws` | The WebSocket URL to register over. |
| `uri` | The SIP URI to register as. |
| `password` | Its password. Removed from the address bar as soon as it has been read. |
| `target` | The SIP URI the Call button dials. |
| `register=1` | Register as soon as the page loads. |
| `answer=1` | Answer an incoming call as soon as it arrives. |
| `ice` | A JSON array of ICE servers, as `GET /api/v1/client/config` gives `ice_servers`. A `turn:` entry without a credential, or with an expired one, is dropped. Removed from the address bar as soon as it has been read, since it carries a TURN credential. |
| `relay=1` | Media only through the TURN server (`iceTransportPolicy: "relay"`). |

A password or a TURN credential in a URL is a harness convenience and nothing else. Nothing
is stored: both live in the page, and are gone on reload. The harness fetches `ice` itself,
from the Node side, signed in as the fixture's API user, so the page never holds an API session
and stays a plain file with no API of its own.

## The readout

The page hangs `window.__athenaSoftphone` on the window while the softphone is mounted, so a
test reads state rather than scraping it off the screen.

| Member | What it gives |
| --- | --- |
| `version` | `1`. Bumped when a field changes meaning. |
| `state()` | `registration`, `call`, `direction`, `remoteIdentity`, `cause`, `localSdp`, `remoteSdp`, `signalingState`, `iceGatheringState`, `iceConnectionState`, `connectionState`, `notice`. |
| `history()` | Every state change since load, oldest first, each with a timestamp. |
| `stats()` | A promise of the browser's own counters: packets and bytes each way, packets lost, the far end's audio level and its accumulated audio energy, the codec, the DTLS state, and the selected candidate pair with each end's address, port and type. |
| `call(target)`, `answer()`, `hangUp()` | The buttons, callable. |

`registration` is `unregistered`, `connecting`, `registered` or `failed`. `call` is `idle`,
`calling`, `ringing`, `incoming`, `connected`, `ended` or `failed`.

The DOM mirrors it. `[data-testid=softphone-registration]` and
`[data-testid=softphone-call-state]` carry a `data-state` attribute with the same values, and
the buttons are `softphone-register`, `softphone-call`, `softphone-answer`,
`softphone-hangup` and `softphone-unregister`.

## The end-to-end run

```
npm run test:e2e
```

Two Chromium contexts open `/softphone.html` against a running interop fixture and call each
other through it, with rtpengine on the media path. Chromium's fake media devices stand in
for a microphone, and the page is opened over loopback, which is a secure context, so there
is no permission prompt and no insecure-origin flag.

The fixture is the server's, brought up by its own script and never by this one:

```
(cd ../athenasip && test/interop/up.sh --rtpengine)
```

It provisions accounts `1001`, `1002` and `1003` with the password `athenaphone` in a realm
named for the address it advertises, and serves this client's `build/` from the same listener
as the API. The spec fails with a clear message when nothing is serving at the API port.

Two tests, each with two ends registered in separate browser contexts:

1. The first account calls the second, which answers on arrival, and the caller hangs up.
2. The second account calls the first, which is answered by clicking, and the callee hangs
   up.

Each asserts that both ends reach `connected`, that ICE reaches `connected` or `completed`
on both, that DTLS completed, and that after two seconds each browser has both sent and
received packets. Where the fixture advertises an address other than loopback, each end's
selected remote candidate must be that address: the engine anchored the call rather than
declining it and letting the two browsers reach each other directly. The server's own harness
reads rtpengine's counters afterwards, so the engine and the endpoints are two witnesses to
the same media.

### The relay phase

When the fixture's engine advertises an address other than the node's own
(`ATHENA_INTEROP_RTPENGINE_ADVERTISE` set to its bridge address), only the fixture's coturn can
reach it, and the same two tests run relayed. The spec signs in as the fixture's API user,
fetches `/client/config`, signs out, requires a TURN server with a credential in it, and opens each page
with `ice` and `relay=1`. On top of the direct phase's assertions, each end's selected pair
must have its local port inside `ATHENA_INTEROP_TURN_MIN`-`_MAX`. That is how a relayed pair
is known: a test asserts facts about the fixture's configuration, never the browser's labels,
and Chrome reports the relayed local candidate as `prflx` once checks run.

Running both phases is `browser.sh`'s job, which owns the fixture: the direct phase with the
engine on the node's address, then the fixture again with the engine on its bridge address. `browser.sh
--direct` or `--relay` runs one of them while iterating.
No single advertised address serves both, since the host reaches rtpengine only at loopback
and coturn only at the bridge.

Each test writes a record to `e2e/results/`: both session descriptions, the state history
and the final counters from each end. That is the "written down when it works" the server's
plan asks for.

### Environment

The names are the ones the server's `test/interop/up.sh` already exports, so a wrapper there
passes its environment through and sets nothing new.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ATHENA_INTEROP_API_PORT` | `8080` | The page is opened at `http://127.0.0.1:<port>/softphone.html`. |
| `ATHENA_INTEROP_WS_PORT` | `8088` | The socket is `ws://127.0.0.1:<port>`. |
| `ATHENA_INTEROP_PUBLIC_ADDRESS` | `127.0.0.1` | The address the node advertises, and rtpengine unless told otherwise. The realm defaults to it. |
| `ATHENA_INTEROP_REALM` | the public address | The realm the accounts live in. |
| `ATHENA_INTEROP_ACCOUNTS` | `1001,1002` | The two users the run registers. |
| `ATHENA_INTEROP_PASSWORD` | `athenaphone` | Their password. |
| `ATHENA_INTEROP_RESULTS` | `e2e/results` | Where the records are written. |
| `ATHENA_INTEROP_PAGE_URL` | `http://127.0.0.1:<api port>` | Override where the page is served from, for running it against `vite preview` while the fixture does not mount the build. |
| `ATHENA_INTEROP_WS_URL` | `ws://127.0.0.1:<ws port>` | Override the socket outright. |
| `ATHENA_INTEROP_RTPENGINE_ADVERTISE` | the public address | What rtpengine writes into the session description. Any other address is the relay phase, and each browser must be sending to it. |
| `ATHENA_INTEROP_TURN_MIN`, `ATHENA_INTEROP_TURN_MAX` | none | coturn's relay range. Required in the relay phase; the spec refuses to start without it rather than asserting against nothing. |
| `ATHENA_INTEROP_API_USER`, `ATHENA_INTEROP_API_PASSWORD` | none | A user of the node, created by `up.sh` with a password generated per run, which the spec signs in as to read `/client/config`. From Node only, required in the relay phase, and kept out of the results record. |

On a machine where something else holds the default ports (`athenaphone-asterisk` holds
5060, 5061, 8088 and 8089 on the development Mac), `up.sh` refuses to start and suggests
alternates. `browser.sh` passes every `ATHENA_INTEROP_*` through, so this works unchanged:

```
ATHENA_INTEROP_SIP_PORT=15060 ATHENA_INTEROP_TLS_PORT=15061 \
ATHENA_INTEROP_WS_PORT=18088  ATHENA_INTEROP_API_PORT=18080 \
ATHENA_INTEROP_RTP_MIN=23000  ATHENA_INTEROP_RTP_MAX=23020 \
ATHENA_INTEROP_NAME=athenasip-interop-alt test/interop/browser.sh
```
