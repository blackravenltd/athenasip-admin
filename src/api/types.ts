/**
 * The records the admin API deals in.
 *
 * These mirror the server's own types (`athenasip/src/types/`) rather than
 * whatever a screen finds convenient, and the field names are the wire names
 * — snake_case — so that a response needs no translation layer to become one
 * of these. When `docs/api/openapi.yaml` exists on the server side, this file
 * is what gets checked against it, and eventually generated from it.
 */

/** A SIP domain this server is responsible for. */
export interface Realm {
  id: string;
  name: string;
  description: string;
  subscriber_count: number;
}

/** A single account within a realm. `ha1` is computed server-side and never sent back. */
export interface Subscriber {
  id: string;
  realm: string;
  username: string;
  display_name: string;
  enabled: boolean;
}

/** A live contact binding. Read-only: registrations are made by phones, not operators. */
export interface Registration {
  id: string;
  aor: string;
  contact: string;
  transport: SipTransport;
  /** Wall-clock milliseconds, so the UI can say "in 4 minutes" without a second clock. */
  expires_unix_ms: number;
  /** The cluster node holding this binding. */
  node_id: string;
  user_agent: string;
}

export type SipTransport = 'udp' | 'tcp' | 'tls' | 'ws' | 'wss';

/** One listener, as the server reports it. */
export interface TransportStatus {
  transport: SipTransport;
  enabled: boolean;
  address: string;
  port: number;
  /** Absent when the server does not say; that is not the same as "down". */
  listening?: boolean;
}

/** What the dashboard reads. Everything here is derived, nothing is settable. */
export interface ServerStatus {
  node_id: string;
  version: string;
  uptime_seconds: number;
  transports: TransportStatus[];
  datastore_url: string;
  events_url: string;
  media_url: string;
  registration_count: number;
  active_call_count: number;
}

/** The builtin RTP relay's settings, as `rtprelay:` in the server config. */
export interface RtpRelaySettings {
  enabled: boolean;
  public_address: string;
  port_min: number;
  port_max: number;
  /** Hold packets from the first endpoint until the second one is heard from. */
  queue_until_both_connected: boolean;
}

export interface CreateRealm {
  name: string;
  description: string;
}

export interface CreateSubscriber {
  username: string;
  display_name: string;
  /** Sent once, in the clear, over TLS. The server derives and stores HA1. */
  password: string;
  enabled: boolean;
}

export interface UpdateSubscriber {
  display_name?: string;
  password?: string;
  enabled?: boolean;
}
