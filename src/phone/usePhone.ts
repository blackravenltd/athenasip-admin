import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminApi } from '../api/AdminApi';
import { ApiError, errorMessage } from '../api/errors';
import type { ClientConfig, ConferencePrefix, SubscriberLine } from '../api/types';
import { usableIceServers } from '../softphone/iceServers';
import { roomOf, type Room } from './conference';
import { sendingSilence } from './devices';
import { Softphone, type CallMedia, type MediaStats, type SipStack, type SoftphoneState } from '../softphone/Softphone';
import { lineOf, signallingUri } from '../softphone/words';

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
  /** The room the current or last outgoing call is to, when its target is one. */
  room?: Room;
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
 * The same configuration names the realm's conference prefixes, so it is also
 * asked for when registering with a WebSocket given; that request is not
 * waited for, and a failure leaves the phone with no rooms, never unable to
 * register. Each call's fetch refreshes them too.
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
    if (socket) {
      phone.register({ socket, uri, password });
      if (asked) api.subscriberConfig(asked).then((config) => learn(asked, config), () => undefined);
      return;
    }
    if (!asked) {
      setLineNotice('A SIP address is sip:user@realm.');
      return;
    }
    setAsking(true);
    const https = window.location.protocol === 'https:';
    api.subscriberConfig(asked).then(
      (config) => {
        learn(asked, config);
        const found = signallingUri(config, https);
        if (!found) {
          setLineNotice(https
            ? 'This node has no secure WebSocket listener, so a page served over https cannot reach it.'
            : 'This node has no WebSocket listener.');
          return;
        }
        phone.register({ socket: found, uri, password });
      },
      (cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 401) {
          setLineNotice('The node did not accept that SIP address and password.');
        } else if (cause instanceof ApiError && cause.status === 404) {
          setLineNotice(`This node serves no realm ${line.current?.realm}.`);
        } else {
          setLineNotice(`Could not ask the node where to connect, so this is a guess: ${errorMessage(cause)}`);
          phone.register({ socket: guessedSocket(), uri, password });
        }
      },
    ).finally(() => setAsking(false));
  }, [api, phone, learn]);

  const unregister = useCallback(() => {
    line.current = undefined;
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
  const room = useMemo(
    () => (state.direction === 'outgoing' ? roomOf(dialled, conferences, rooms?.realm) : undefined),
    [state.direction, dialled, conferences, rooms?.realm],
  );
  const silent = state.call === 'connected' && !state.muted && !state.held && sendingSilence(energies);
  return {
    phone, state, remoteStream: streams.remote, localStream: streams.local, stats, iceNotice, asking, lineNotice, silent,
    realm: rooms?.realm, conferences, room, register, unregister, call, answer,
  };
}
