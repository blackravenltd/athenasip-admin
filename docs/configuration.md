# AthenaSIP Admin - Configuration

This client has almost nothing to configure, on purpose: in the deployment it is built for,
AthenaSIP serves the bundle and the API from one process, so the API is same-origin and there
is no address to supply.

## Build-time

Vite environment variables, read at build time and compiled in. All optional.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_ATHENASIP_LIVE` | unset | `true` talks to a real server. Anything else uses the in-memory fake. |
| `VITE_SIP_WS_URL` | port 9500 on this page's host | The softphone's WebSocket URL. |
| `VITE_SIP_URI` | empty | A SIP URI to prefill on the softphone. |
| `VITE_SIP_TARGET` | empty | A call target to prefill on the softphone. |

No credential is ever a build-time variable. The softphone's password is typed into the page,
or arrives in its query string for the end-to-end run, and is held in memory and gone on
reload. The query string and the end-to-end run's own environment are in
[softphone.md](softphone.md).

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
