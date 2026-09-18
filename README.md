![AthenaSIP Logo](docs/logos/athenasip_small_white.png)

# AthenaSIP Admin

**Project Status: ALPHA - DO NOT USE**

An OSS React administration frontend for [AthenaSIP](https://github.com/blackravenltd/athenasip).

The SIP server is the source of truth. This client renders and edits what the server's admin
API exposes, and ships as a static bundle the server serves from its own HTTP listener.

## Key Features

* **React and TypeScript** on Vite, with Vitest for tests.
* **Low dependency** - React, React Router and JsSIP. The interface is hand-written CSS
  with no UI framework.
* **Same origin by default** - the server serves this bundle and the API from one process,
  so there is no cross-origin configuration to get wrong.

## Documentation

* [Installation](docs/installation.md)
* [Quick Start](docs/quick_start.md)
* [Configuration](docs/configuration.md)
* [Architecture](docs/architecture.md)

For more information, please see the [docs](docs/) directory. Current work is tracked in
[TODO/ACTIVE.md](TODO/ACTIVE.md).

## Running it

```
npm install
npm run dev
```

The admin API does not exist on the server yet, so `npm run dev` runs against an in-memory
fake that enforces the same rules the server will. Point it at a real node with
`VITE_ATHENASIP_LIVE=true npm run dev`; the dev server proxies `/api` to
`http://127.0.0.1:8080`, overridable with `ATHENASIP_API`.

```
npm test          # Vitest
npm run typecheck # tsc, both projects
npm run build     # typecheck then a production bundle into build/
```

## License

AthenaSIP Admin is licensed under [GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).
Please see the [LICENSE](LICENSE) file.
