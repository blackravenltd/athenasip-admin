# AthenaSIP Admin - Quick Start

```
npm install
npm run dev
```

Open the address Vite prints and sign in as `admin`, password `admin`. With no AthenaSIP node involved,
the client runs against an in-memory fake seeded with two realms, three subscribers, two
registrations and two live calls, which enforces the node's rules, so every screen has something to show and
every error path can be reached. `ops`, `helpdesk` and `newhire`, each with its username as
its password, show what a user with fewer roles, or none, gets.

## What is here

- **Overview** - whether the node is serving, its identity, version and datastore, how many
  realms and registrations it holds, every node in the cluster with its status, and each
  transport with the URI a client would use.
- **SIP** - realms with their registration and media policy, the subscribers of a realm, each
  with its own media profile where its phone needs one, the live registrations, and the
  clients the node probes with OPTIONS, with whether they answer and what media they say they
  take.
- **Calls** - the calls the node is carrying now, read every two seconds. For a relayed call,
  each leg's packets in each direction, and a flag when one direction stands still while the
  rest of the call moves, which is one-way audio.
- **Media** - the node's media engine and whether it is connected, and each realm's media
  policy: whether calls are relayed through the engine, and what it offers a phone it has not
  heard from yet. Each setting is the realm's own or the server's default, from its
  `behaviour:` section, and can be put back to the default. Below that, the subscribers whose
  phone refused the media it was offered, with a button to set the profile it took.
- **Security** - which transports carry signalling unencrypted, and the encrypted listeners.
- **Users** - who can sign in, and their roles.
- **Diagnostics** - a WebRTC softphone that registers over the WebSocket transport and places
  one call, with the negotiation and packet counters to tell a silent call from a working one.

## Against a real node

```
VITE_ATHENASIP_LIVE=true npm run dev
```

The dev server proxies `/api` to `http://127.0.0.1:8080`; set `ATHENASIP_API` to point
elsewhere. See [configuration.md](configuration.md) for signing in and roles.
