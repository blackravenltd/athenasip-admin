# AthenaSIP Admin - Goals

## The server owns the truth

This is a view over the admin API. No state that matters lives only in the browser, and
nothing is faked in the interface that the API cannot supply.

## Works out of the box

AthenaSIP serves this bundle from its own HTTP listener. A fresh install reaches a usable
admin page with no build step and no separate web server.

## Low dependency

React, React Router and JsSIP. The interface is hand-written CSS. A new runtime dependency
needs a reason that a few lines of our own code cannot meet.

## Usable without a telecoms background

Every screen explains the concept before it asks you to configure it. The Realms screen sets
the standard: it says what a realm is, with a worked SIP identity, before showing a table.

## No secrets in the bundle

Credentials are entered, held in memory, and never compiled in or written to browser storage.
