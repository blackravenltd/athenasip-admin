# AthenaSIP Admin - Architecture

## Shape

```
src/
  main.tsx          Mounts the app and chooses which AdminApi it talks to.
  App.tsx           The shell: topbar, section bar, routes.
  app/              routes.ts (every path, named once) and navigation.ts.
  api/              The seam. AdminApi, an HTTP implementation, an in-memory fake.
  components/       Shared UI: SectionNav, Modal, Status, VolumeMeter.
  hooks/            useRefreshableAsync, useSubmit, usePagination.
  screens/          One file per screen, each taking its AdminApi as a prop.
  styles/           tokens.css (the palette), base.css (shell), admin.css (surfaces).
```

## The API seam

`src/api/AdminApi.ts` is an interface describing everything this client can ask a server to
do. There are two implementations:

- `HttpAdminApi` speaks to a real server. It is the only file in the repository that knows a
  URL, a verb or a status code exists.
- `FakeAdminApi` holds the same records in memory and enforces the same rules — a duplicate
  realm is rejected, a realm with subscribers cannot be deleted. It is what the application
  runs against until the server grows `/api/v1`, and what every screen test runs against.

One implementation for development and for tests, so a test cannot pass against a fixture the
running application never sees.

The endpoints `HttpAdminApi` calls are the ones specified under "Admin API, part 1" in the
server's `TODO/ACTIVE.md`. None of them exist yet.

## Records and dialogues

A list shows records compactly and read-only. Nothing in a row is an input, so a list never
holds half-saved state. Every mutation opens a `FormModal` or a `ConfirmModal`, which own the
parts that must not vary between screens: focus management, Escape to cancel, Cancel before
the commit, and one busy flag disabling both.

## Loading

`useRefreshableAsync` distinguishes a first load, which has nothing to show and shows a
spinner, from a refresh, which already has a list on screen and keeps it. Replacing a working
list with a spinner to fetch the same list back is how a page that is working looks broken.

Aborts are not failures. Every request is cancelled on unmount and superseded on refresh.

## Styling

Hand-written CSS, no framework. The palette is in `src/styles/tokens.css` and follows
macha-client's structure — near-black ground, three layered surfaces, a three-step text ramp,
an accent ramp that lives at the bottom of its hue — with a blue-steel accent instead of
macha's crimson.

The accent marks *where you are*: the active nav item, the focused control, the primary
action. It never means "good". Green, amber and red are reserved for state a reader must not
have to interpret, and nothing else may use them.

Dark only. `color-scheme: dark` is set, so form controls and scrollbars follow.
