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
| View cluster status | Read nodes, registrations, calls and the media engine. |
| Manage realms | Create, change and remove realms and their behaviour. |
| Manage subscribers | Create, change and remove a realm's subscribers. |
| Manage users | Create, change and remove users and their roles. |
| Manage cluster | Node membership and configuration. No screen uses it yet. |

The console hides what a user's roles do not allow; the node's 403 is what enforces it. The
model is the server's, in its `docs/authentication.md`.

## Rate limits

The node limits every route and answers 429 with `Retry-After`. The console says how long to
wait and never signs out on one. Sign-in is limited most tightly, per address and per
username, and successful sign-ins count.
