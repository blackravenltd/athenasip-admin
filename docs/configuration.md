# AthenaSIP Admin - Configuration

This client has almost nothing to configure, on purpose: in the deployment it is built for,
AthenaSIP serves the bundle and the API from one process, so the API is same-origin and there
is no address to supply.

## Build-time

Vite environment variables, read at build time and compiled in. All optional.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_ATHENASIP_LIVE` | unset | `true` talks to a real node. Anything else uses the in-memory fake, which is wrong for a deployment. |
| `VITE_SIP_WS_URL` | port 8088 on this page's host | The softphone's WebSocket URL. |
| `VITE_SIP_URI` | empty | A SIP URI to prefill on the softphone. |
| `VITE_SIP_TARGET` | empty | A call target to prefill on the softphone. |

No credential is ever a build-time variable. The softphone's password is typed into the page,
or arrives in its query string for the end-to-end run, and is held in memory and gone on
reload. The query string and the end-to-end run's own environment are in
[softphone.md](softphone.md).

## Signing in and roles

The console signs in as a **user** of the node, with a username and password, and holds the
session in memory only. A user is somebody or some system that uses the node's API; it is not
a subscriber, and neither is ever made from the other. What a user can do is its roles, and
nothing implies anything else: there is no superuser, and a new user has none.

| Role | What it permits |
| --- | --- |
| View cluster status | Read the node, its transports and who is registered. Changes nothing. |
| Manage realms | Create, change and remove realms, with their registration and media policy. |
| Manage subscribers | Create, change and remove the subscribers in a realm. |
| Manage users | Create, change and remove users and their roles. It can grant itself the rest. |
| Manage cluster | Node membership and configuration. Nothing in the console uses it yet. |

A user with no roles can sign in and is told so. A username and password is the only way in:
the node has no configured API tokens. The first user on a fresh node, and getting back in when
every password is lost, is `athenasip --add-user NAME` on the node's host. A node that predates
user logins answers the login with 404, and the console says it cannot sign in to it.

The model is the server's, in `../athenasip/docs/authentication.md`.

Against the in-memory development node each user's password is its username: `admin` has every
role, `ops` views status, `helpdesk` manages subscribers, `newhire` has none, and `former` is
disabled.

## Development

| Variable | Default | Meaning |
| --- | --- | --- |
| `ATHENASIP_API` | `http://127.0.0.1:8080` | Where the dev server proxies `/api`. |

## Deployment

The server's own `config.yaml` decides where the bundle is served from:

```yaml
http:
  address: 0.0.0.0
  port: 8080
  api:
    enable: true
  files:
    enable: true
    path: "../admin/"
```

Copy `build/` to that path.
