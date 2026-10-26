# AthenaSIP Admin - Configuration

There is almost nothing to configure: the node serves the bundle and the API from one
listener, so the API is same-origin and has no address to supply.

## Build-time variables

Read by Vite and compiled in. All optional. No credential is ever one of them.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_ATHENASIP_LIVE` | unset | `true` talks to a real node; anything else uses the in-memory fake. |
| `VITE_SIP_WS_URL` | from the node | The diagnostic softphone's WebSocket URL. |
| `VITE_SIP_URI` | empty | A SIP URI to prefill on the diagnostic softphone. |
| `VITE_SIP_TARGET` | empty | A call target to prefill on the diagnostic softphone. |

## Development variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `ATHENASIP_API` | `http://127.0.0.1:8080` | Where the dev server proxies `/api`. |

## Signing in and roles

The console signs in as a **user** of the node with a username and password, and holds the
session in memory: a reload asks again. A user is not a **subscriber**; a subscriber belongs
to a realm, registers and makes calls.

A user can do what its roles allow. No role implies another, there is no superuser, and a new
user has none.

| Role | What it permits |
| --- | --- |
| View cluster status | Read nodes, registrations, live calls, conferences, call history, presence and the media engine. Opens the event stream that keeps those screens current. |
| Manage realms | Create, change and remove realms, their behaviour and their attributes. |
| Manage subscribers | Create, change and remove a realm's subscribers and their attributes, and look up one's presence. |
| Manage users | Create, change and remove users and their roles. |
| Manage cluster | Hang up a live call, remove someone from a conference, reload the routing scripts of the node the console talks to, and lift a ban for guessing passwords. |
| Manage trunks | Create, change and remove trunks, conference foci among them, and set their passwords. |

A trunk's password is kept as given, not hashed, so give Manage trunks to as few users as
possible.

The console hides what a user's roles do not allow; the node's 403 is what enforces it. The
model is the server's, in its `docs/authentication.md`.

## Conferencing

A conference room is a name dialled in a realm, such as `conf-sales`, that a conference focus
answers to (RFC 4579). The focus, FreeSWITCH or another, mixes the media; the node routes each
participant's call to it. To set one up:

1. Add the focus as a trunk under **SIP, Trunks**, and tick **Conference focus**: the prefix
   that makes a name a room, and the realms whose rooms it serves (every realm when none is
   named). A numeric prefix such as `8` suits phones that cannot dial letters.
2. Run the node with the standard Lua scripts (`lua://`). `builtin://` does not route rooms.

There is nothing to create per room: it exists while somebody is in it. **Calls,
Conferences** lists the rooms in use and who is in each, and with Manage cluster removes
someone. The Phone joins a room from its **Conferences** panel, or by dialling the name. A desk
phone's busy lamp key for a room lights while anyone is in it.

Muting someone and locking a room belong to the focus and are not offered. The participants
listed are the calls the node routed; the focus's own roster, with who is muted, comes with
the server's next conferencing step.

## What the console does not manage

The node can do more than the console shows. For the rest, use the admin API
(`docs/api/openapi.yaml` in the server) or the server's own tools:

| On the node | How | Role |
| --- | --- | --- |
| Routing and authorisation scripts (`lua://`) | The server's [scripting guide](https://github.com/blackravenltd/athenasip/blob/main/docs/scripting.md) | none, on the host |
| Reloading the scripts of a node other than the one the console talks to | `POST /api/v1/policy/reload` on that node, or `SIGHUP` | Manage cluster |
| Muting or locking a conference | The focus's own tools | none |
| Metrics, for a monitoring system | `GET /metrics`, outside `/api/v1` | as the API says |

A realm, subscriber or trunk's `attributes` are replaced whole when given, so the console
sends them only when they were edited, and then all of them. Its media and key press settings
go only to a node that has them.

## Guessing passwords

The node bans an address that answers too many SIP sign-in challenges wrongly, and closes a
SIP address whose password is guessed at too often from anywhere to everyone but the phones
already signed in as it. Security lists both across the cluster, read every 30 seconds, and
Manage cluster lifts either, which also forgets the wrong passwords counted. A node that
started after a ban was made does not have it. The Phone says when its line is shut out and
for how long.

A realm must be a host name and a subscriber's user an RFC 3261 user part; the console says
so before sending, and the node refuses anything else.

## Rate limits

The node limits every route and answers 429 with `Retry-After`. The console says how long to
wait and never signs out on one. Sign-in is limited most tightly, per address and per
username, and successful sign-ins count.
