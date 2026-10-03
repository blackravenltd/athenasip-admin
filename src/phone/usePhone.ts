import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminApi } from '../api/AdminApi';
import { errorMessage } from '../api/errors';
import { usableIceServers } from '../softphone/iceServers';
import { sendingSilence } from './devices';
import { Softphone, type CallMedia, type MediaStats, type SipStack, type SoftphoneState } from '../softphone/Softphone';

export interface PhoneHandle {
  phone: Softphone;
  state: SoftphoneState;
  remoteStream?: MediaStream;
  localStream?: MediaStream;
  /** The browser's counters, every second while a call is connected. */
  stats?: MediaStats;
  /** Why the node gave no ICE servers for the last call, when it did not. */
  iceNotice?: string;
  /** The connected, unmuted call has sent nothing but silence for the last few seconds. */
  silent: boolean;
  call: (target: string, media?: CallMedia) => void;
  answer: (media?: CallMedia) => void;
}

/**
 * The console's phone: one `Softphone` for as long as the shell holds it.
 *
 * Unlike the harness page's hook it puts nothing on `window` and reads no
 * query string. TURN credentials are minted per request and expire, so the
 * ICE servers are asked for as each call is placed or answered; without the
 * node's answer the call goes ahead with none.
 */
export function usePhone(stack: SipStack, api: AdminApi): PhoneHandle {
  const phone = useMemo(() => new Softphone(stack), [stack]);
  const [state, setState] = useState<SoftphoneState>(phone.state);
  const [streams, setStreams] = useState<{ remote?: MediaStream; local?: MediaStream }>({});
  const [stats, setStats] = useState<MediaStats>();
  const [iceNotice, setIceNotice] = useState<string>();
  const [energies, setEnergies] = useState<Array<number | undefined>>([]);

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

  const withIce = useCallback((place: (servers: RTCIceServer[]) => void) => {
    setIceNotice(undefined);
    api.clientConfig().then(
      (config) => usableIceServers(config.ice_servers),
      (cause: unknown) => {
        setIceNotice(`No ICE servers from the node, calling without: ${errorMessage(cause)}`);
        return [];
      },
    ).then(place);
  }, [api]);

  const call = useCallback((target: string, media: CallMedia = {}) => {
    withIce((servers) => phone.call(target, { servers }, media));
  }, [phone, withIce]);

  const answer = useCallback((media: CallMedia = {}) => {
    withIce((servers) => phone.answer({ servers }, media));
  }, [phone, withIce]);

  const silent = state.call === 'connected' && !state.muted && !state.held && sendingSilence(energies);
  return { phone, state, remoteStream: streams.remote, localStream: streams.local, stats, iceNotice, silent, call, answer };
}
