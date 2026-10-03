# AthenaSIP Admin - Installation

## Requirements

Node 20 or newer.

## Building

```
npm install
VITE_ATHENASIP_LIVE=true npm run build
```

Without `VITE_ATHENASIP_LIVE=true` the bundle talks to an in-memory fake rather than the node
that serves it. `npm run build` typechecks both TypeScript projects and then produces a production bundle in
`build/`. The bundle is served by AthenaSIP itself: copy `build/` to the path named by
`http.files.path` in the server's `config.yaml`, and the server's static middleware serves it
from the same listener that answers `/api/v1`.

To serve it standalone instead:

```
npm install -g serve
serve -s build
```

A standalone deployment is cross-origin to the API, which the client does not currently
configure for. Serving it from the SIP server is the supported arrangement.

## Development

```
npm run dev
```

The dev server runs against an in-memory fake of the admin API by default. To run against a
real node:

```
VITE_ATHENASIP_LIVE=true npm run dev
```

`/api` is proxied to `http://127.0.0.1:8080`; set `ATHENASIP_API` to point elsewhere.
