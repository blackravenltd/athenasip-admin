# AthenaSIP Admin - Quick Start

```
npm install
npm run dev
```

Open the address Vite prints. With no AthenaSIP server involved, the client runs against an
in-memory fake seeded with two realms, three subscribers and two registrations, so every
screen has something to show and every error path can be reached.

## What is here

- **Overview** - node identity, uptime, transports and their state, the datastore, event
  system and media engine URLs.
- **SIP** - realms, the subscribers of a realm, and the live registrations.
- **Media** - the media engine, and the builtin RTP relay's settings.
- **Security** - which transports are carrying signalling unencrypted, and the TLS listener.
- **Diagnostics** - a WebRTC softphone that registers over the WebSocket transport and places
  one call, with a level meter in each direction so a silent call is distinguishable from a
  working one.

## Against a real server

```
VITE_ATHENASIP_LIVE=true npm run dev
```

Every screen will report a failure, because the server has no `/api/v1` yet. See
`TODO/ACTIVE.md`.
