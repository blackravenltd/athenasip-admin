import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminApi } from '../api/AdminApi';
import { ApiError, errorMessage } from '../api/errors';
import type { ClientConfig, ConferencePrefix, SubscriberLine } from '../api/types';
import { usableIceServers } from '../softphone/iceServers';
import { roomOf, type Room } from './conference';
import { CONFIG_WAIT_MS, lineSettings } from './line';
import { sendingSilence } from './devices';
import { Softphone, type CallMedia, type MediaStats, type SipStack, type SoftphoneState } from '../softphone/Softphone';
import { lineOf } from '../softphone/words';

export interface PhoneHandle {
  phone: Softphone;
  state: SoftphoneState;
  remoteStream?: MediaStream;
  localStream?: MediaStream;
  /** The browser's media counters, updated every second while a call is connected. */
  stats?: MediaStats;
  /** Why the node gave no ICE servers for the last call, when it did not. */
  iceNotice?: string;
  /** Asking the node where to connect, before registering. */
  asking: boolean;
  /** Why registering did not start, or why its WebSocket is a guess. */
  lineNotice?: string;
  /** The connected, unmuted call has sent nothing but silence for the last few seconds. */
  silent: boolean;
  /** The registered line's realm. */
  realm?: string;
  /**
   * The realm's conference prefixes, from its client configuration; empty
   * until the node has said, and for a realm with no rooms.
   */
  conferences: ConferencePrefix[];
  /** The room the current or last call is with: one dialled, or one whose focus called. */
  room?: Room;
  /** How many flows the registrar holds for the line, each to a node (RFC 5626). */
  flows: number;
  /** Registers; an empty `socket` asks the node, signed with the line's own credentials. */
  register: (line: { uri: string; password: string; socket: string }) => void;
  unregister: () => void;
  call: (target: string, media?: CallMedia) => void;
  answer: (media?: CallMedia) => void;
}

const NO_ROOMS: ConferencePrefix[] = [];

/** The fallback SIP WebSocket: this host, port 8088. */
function guessedSocket(): string {
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8088`;
}

/**
 * The console's phone: one `Softphone` for as long as the shell holds it.
 *
 * The node's client configuration is signed with the line's own SIP
 * credentials, which are held here, in memory, while the line is in use. It
 * says where to connect when no WebSocket was given, and TURN credentials
 * expire, so ICE servers are fetched as each call is placed or answered; if
 * the node does not answer, the call proceeds with none.
 *
 * The same configuration says how to register: every node's WebSocket to
 * fail over across, how many flows to keep, each to a different node, and
 * the lifetime the realm grants. It names the realm's conference prefixes
 * too. So it is asked for when registering with a WebSocket given as well,
 * waited for a few seconds at most, and a failure never stops the phone
 * registering. Each call's fetch refreshes the rooms.
 *
 * Closing the tab unregisters, so calls stop being sent to a phone that is
 * gone; a page kept in the browser's back-forward cache registers again
 * when it is shown.
 */
export function usePhone(stack: SipStack, api: AdminApi): PhoneHandle {
  const phone = useMemo(() => new Softphone(stack), [stack]);
  const [state, setState] = useState<SoftphoneState>(phone.state);
  const [streams, setStreams] = useState<{ remote?: MediaStream; local?: MediaStream }>({});
  const [stats, setStats] = useState<MediaStats>();
  const [iceNotice, setIceNotice] = useState<string>();
  const [asking, setAsking] = useState(false);
  const [lineNotice, setLineNotice] = useState<string>();
  const line = useRef<SubscriberLine | undefined>(undefined);
  // What the line registered with, held in memory to register again when a cached page is shown.
  const registration = useRef<{ uri: string; password: string; socket: string } | undefined>(undefined);
  const parked = useRef<{ uri: string; password: string; socket: string } | undefined>(undefined);
  const [energies, setEnergies] = useState<Array<number | undefined>>([]);
  const [rooms, setRooms] = useState<{ realm: string; prefixes: ConferencePrefix[] }>();
  // What the last outgoing call dialled, as given: a room's URI is asked for exactly so.
  const [dialled, setDialled] = useState<string>();

  /** Keeps the realm's rooms from a configuration fetched for the line still in use. */
  const learn = useCallback((asked: SubscriberLine, config: ClientConfig) => {
    if (line.current !== asked) return;
    setRooms({ realm: asked.realm, prefixes: config.realm?.conferences ?? [] });
  }, []);

  useEffect(() => {
    const unsubscribe = phone.subscribe((next) => {
      setState(next);
      setStreams((current) => (current.remote === phone.remoteStream && current.local === phone.localStream
        ? current
        : { remote: phone.remoteStream, local: phone.localStream }));
    });
    return () => {
      unsubscribe();
      phone.dispose();
    };
  }, [phone]);

  useEffect(() => {
    if (state.call !== 'connected') {
      setStats(undefined);
      setEnergies([]);
      return;
    }
    let cancelled = false;
    const read = async () => {
      const next = await phone.stats();
      if (cancelled) return;
      setStats(next);
      setEnergies((current) => [...current.slice(-9), next?.sentAudioEnergy]);
    };
    void read();
    const timer = setInterval(() => { void read(); }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phone, state.call]);

  const register = useCallback(({ uri, password, socket }: { uri: string; password: string; socket: string }) => {
    setLineNotice(undefined);
    setRooms(undefined);
    const asked = lineOf(uri, password);
    line.current = asked;
    registration.current = { uri, password, socket };
    if (!asked) {
      if (socket) phone.register({ socket, uri, password });
      else setLineNotice('A SIP address is sip:user@realm.');
      return;
    }
    setAsking(true);
    const https = window.location.protocol === 'https:';
    // With a WebSocket given the node is only consulted, so it is not waited for long.
    const controller = new AbortController();
    const timer = socket ? setTimeout(() => controller.abort(), CONFIG_WAIT_MS) : undefined;
    api.subscriberConfig(asked, controller.signal).then(
      (config) => {
        if (line.current !== asked) return;
        learn(asked, config);
        const settings = lineSettings(config, https, socket || undefined);
        if (!settings.socket) {
          setLineNotice(https
            ? 'This node has no secure WebSocket listener, so a page served over https cannot reach it.'
            : 'This node has no WebSocket listener.');
          return;
        }
        phone.register({ ...settings, socket: settings.socket, uri, password });
      },
      (cause: unknown) => {
        if (line.current !== asked) return;
        if (socket) {
          phone.register({ socket, uri, password });
          return;
        }
        if (cause instanceof ApiError && cause.status === 401) {
          setLineNotice('The node did not accept that SIP address and password.');
        } else if (cause instanceof ApiError && cause.status === 404) {
          setLineNotice(`This node serves no realm ${line.current?.realm}.`);
        } else {
          setLineNotice(`Could not ask the node where to connect, so this is a guess: ${errorMessage(cause)}`);
          phone.register({ socket: guessedSocket(), uri, password });
        }
      },
    ).finally(() => {
      clearTimeout(timer);
      setAsking(false);
    });
  }, [api, phone, learn]);

  useEffect(() => {
    const hide = (event: PageTransitionEvent) => {
      if (!line.current || phone.state.registration === 'unregistered') return;
      // The un-REGISTER, and a BYE for a call in progress, go out as the page goes.
      parked.current = event.persisted ? registration.current : undefined;
      phone.unregister();
    };
    const show = (event: PageTransitionEvent) => {
      const again = parked.current;
      parked.current = undefined;
      if (event.persisted && again) register(again);
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [phone, register]);

  const unregister = useCallback(() => {
    line.current = undefined;
    registration.current = undefined;
    setRooms(undefined);
    phone.unregister();
  }, [phone]);

  const withIce = useCallback((place: (servers: RTCIceServer[]) => void) => {
    setIceNotice(undefined);
    const asked = line.current;
    if (!asked) {
      place([]);
      return;
    }
    api.subscriberConfig(asked).then(
      (config) => {
        learn(asked, config);
        return usableIceServers(config.ice_servers);
      },
      (cause: unknown) => {
        setIceNotice(`No ICE servers from the node, calling without: ${errorMessage(cause)}`);
        return [];
      },
    ).then(place);
  }, [api, learn]);

  const call = useCallback((target: string, media: CallMedia = {}) => {
    setDialled(target);
    withIce((servers) => phone.call(target, { servers }, media));
  }, [phone, withIce]);

  const answer = useCallback((media: CallMedia = {}) => {
    setDialled(undefined);
    withIce((servers) => phone.answer({ servers }, media));
  }, [phone, withIce]);

  const conferences = rooms?.prefixes ?? NO_ROOMS;
  // A room dialled, or one whose focus calls this line, which then comes from the room's address.
  const room = useMemo(
    () => roomOf(state.direction === 'outgoing' ? dialled : state.direction === 'incoming' ? state.remoteIdentity : undefined, conferences, rooms?.realm),
    [state.direction, state.remoteIdentity, dialled, conferences, rooms?.realm],
  );
  const silent = state.call === 'connected' && !state.muted && !state.held && sendingSilence(energies);
  return {
    phone, state, remoteStream: streams.remote, localStream: streams.local, stats, iceNotice, asking, lineNotice, silent,
    realm: rooms?.realm, conferences, room, flows: state.flows ?? 0, register, unregister, call, answer,
  };
}
