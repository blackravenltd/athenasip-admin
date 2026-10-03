/**
 * A WebRTC endpoint over SIP, with nothing of React in it.
 *
 * This is the whole of what the softphone does: register one account against
 * one node over a WebSocket, place or answer one call, and say exactly what
 * happened while doing it. It owns the JsSIP user agent and session, and it
 * publishes an immutable snapshot of its state after every change, so that a
 * screen renders it and a test harness reads it, both through one interface.
 *
 * The record it keeps is deliberately more than a status line. A call that
 * says "Connected" and carries no audio is the failure a relay
 * misconfiguration actually produces, so the snapshot carries the session
 * descriptions each end saw, the ICE and DTLS state, the candidate pair the
 * browser settled on and the packet counters, which together say whether
 * media was negotiated, where it was sent, and whether any came back.
 *
 * JsSIP is injected rather than imported. The controller can then be driven
 * in a test by a user agent that never opens a socket, and the bundle that
 * carries JsSIP is loaded only by the page that needs it.
 */
import type { RTCSession, EndEvent, PeerConnectionEvent, SDPEvent } from 'jssip/lib/RTCSession';
import type { UA, UAConfiguration, RTCSessionEvent, UnRegisteredEvent } from 'jssip/lib/UA';

export type RegistrationState = 'unregistered' | 'connecting' | 'registered' | 'failed';
export type CallState = 'idle' | 'calling' | 'ringing' | 'incoming' | 'connected' | 'ended' | 'failed';
export type CallDirection = 'outgoing' | 'incoming';

/** One end of the pair ICE settled on: address, port and how the candidate was found. */
export interface CandidateEnd {
  address: string;
  port: number;
  type: string;
  protocol: string;
}

/** What the browser's own statistics say about the media, at one instant. */
export interface MediaStats {
  packetsSent: number;
  packetsReceived: number;
  bytesSent: number;
  bytesReceived: number;
  packetsLost: number;
  /** The far end's level as the browser measured it, 0 to 1, when it reports one. */
  audioLevel?: number;
  /**
   * The far end's accumulated energy, which only grows. An instant's level can
   * land in a gap between beeps; the energy says the payload was not silence.
   */
  totalAudioEnergy?: number;
  codec?: string;
  dtlsState?: string;
  candidatePair?: { local: CandidateEnd; remote: CandidateEnd; state: string };
}

export interface SoftphoneState {
  registration: RegistrationState;
  call: CallState;
  direction?: CallDirection;
  /** The far end's identity, as the request named it. */
  remoteIdentity?: string;
  /** Why the call or the registration ended the way it did, in JsSIP's words. */
  cause?: string;
  localSdp?: string;
  remoteSdp?: string;
  signalingState?: RTCSignalingState;
  iceGatheringState?: RTCIceGatheringState;
  iceConnectionState?: RTCIceConnectionState;
  connectionState?: RTCPeerConnectionState;
  /** A message for the person at the keyboard, when something needs saying. */
  notice?: string;
}

export interface SoftphoneConfig {
  socket: string;
  uri: string;
  password: string;
}

/** A moment in the state's history, for a harness to write down afterwards. */
export interface Transition {
  at: number;
  registration: RegistrationState;
  call: CallState;
  iceConnectionState?: RTCIceConnectionState;
  connectionState?: RTCPeerConnectionState;
  cause?: string;
}

/**
 * The corner of JsSIP this controller uses, so a test can provide one that
 * never touches the network.
 */
export interface SipStack {
  createUserAgent(configuration: UAConfiguration): UA;
  createSocket(url: string): UAConfiguration['sockets'];
}

export type Listener = (state: SoftphoneState) => void;

const INITIAL: SoftphoneState = { registration: 'unregistered', call: 'idle' };

/**
 * With no ICE servers the media engine is the only remote candidate, and it
 * advertises an address the browser can reach. That is the harness page's
 * case; the console passes what the node's `/client/config` names.
 */
const peerConfiguration = (iceServers: RTCIceServer[], relayOnly: boolean): RTCConfiguration =>
  (relayOnly ? { iceServers, iceTransportPolicy: 'relay' } : { iceServers });

/** What ICE may use for one call. `relayOnly` is how TURN is proven when a direct path would win. */
export interface IceOptions {
  servers: RTCIceServer[];
  relayOnly?: boolean;
}

const NO_ICE: IceOptions = { servers: [] };

const MEDIA: MediaStreamConstraints = { audio: true, video: false };

export class Softphone {
  private current: SoftphoneState = INITIAL;
  private readonly listeners = new Set<Listener>();
  private readonly transitions: Transition[] = [];
  private agent?: UA;
  private session?: RTCSession;
  private peer?: RTCPeerConnection;
  private remote?: MediaStream;
  private ice: IceOptions = NO_ICE;

  constructor(private readonly sip: SipStack, private readonly clock: () => number = Date.now) {
    this.record();
  }

  get state(): SoftphoneState {
    return this.current;
  }

  /** The far end's audio, once there is any. */
  get remoteStream(): MediaStream | undefined {
    return this.remote;
  }

  /** Every state change since construction, oldest first. */
  get history(): readonly Transition[] {
    return this.transitions;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Resolves with the first state that satisfies `predicate`, or rejects after `timeoutMs`. */
  waitFor(predicate: (state: SoftphoneState) => boolean, timeoutMs = 10_000): Promise<SoftphoneState> {
    if (predicate(this.current)) return Promise.resolve(this.current);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for the softphone; it is ${describe(this.current)}`));
      }, timeoutMs);
      const unsubscribe = this.subscribe((state) => {
        if (!predicate(state)) return;
        clearTimeout(timer);
        unsubscribe();
        resolve(state);
      });
    });
  }

  register(config: SoftphoneConfig): void {
    this.stopAgent();
    this.reset({ registration: 'connecting' });
    try {
      const agent = this.sip.createUserAgent({
        sockets: this.sip.createSocket(config.socket),
        uri: config.uri,
        password: config.password,
      });
      agent.on('registered', () => this.update({ registration: 'registered', notice: undefined }));
      agent.on('unregistered', () => this.update({ registration: 'unregistered' }));
      agent.on('registrationFailed', (event: UnRegisteredEvent) => {
        const cause = event.cause ?? 'no reason given';
        this.update({ registration: 'failed', cause, notice: `Registration failed: ${cause}` });
      });
      agent.on('disconnected', () => {
        // A socket that drops takes the registration with it, whatever the
        // registrar still believes: nothing can reach this page any more.
        if (this.current.registration !== 'failed') this.update({ registration: 'unregistered' });
      });
      agent.on('newRTCSession', (event: RTCSessionEvent) => this.adopt(event));
      agent.start();
      this.agent = agent;
    } catch (cause) {
      this.update({ registration: 'failed', notice: `Could not start: ${String(cause)}` });
    }
  }

  unregister(): void {
    this.stopAgent();
    this.reset({ registration: 'unregistered' });
  }

  /** What a call or an answer uses when it is not told otherwise: the harness page's `ice` and `relay`. */
  useIce(ice: IceOptions): void {
    this.ice = ice;
  }

  call(target: string, ice: IceOptions = this.ice): void {
    if (!this.agent || this.session) return;
    this.update({ notice: undefined, cause: undefined });
    try {
      this.agent.call(target, {
        mediaConstraints: MEDIA,
        pcConfig: peerConfiguration(ice.servers, ice.relayOnly ?? false),
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      });
    } catch (cause) {
      this.update({ call: 'failed', notice: `Could not call: ${String(cause)}` });
    }
  }

  answer(ice: IceOptions = this.ice): void {
    if (!this.session || this.current.call !== 'incoming') return;
    this.session.answer({ mediaConstraints: MEDIA, pcConfig: peerConfiguration(ice.servers, ice.relayOnly ?? false) });
  }

  hangUp(): void {
    this.session?.terminate();
  }

  /** The browser's own account of the media, or nothing when there is no connection to ask. */
  async stats(): Promise<MediaStats | undefined> {
    if (!this.peer) return undefined;
    return summarise(await this.peer.getStats());
  }

  /** Stops everything. The instance is not reusable afterwards. */
  dispose(): void {
    this.stopAgent();
    this.listeners.clear();
  }

  private adopt({ session, originator }: RTCSessionEvent): void {
    // One call at a time. A second arriving while one is up is refused with
    // 486 rather than silently replacing it.
    if (this.session && this.session !== session) {
      session.terminate({ status_code: 486 });
      return;
    }
    this.session = session;
    const incoming = originator === 'remote';
    const remoteIdentity = session.remote_identity?.uri?.toString();
    this.update({
      call: incoming ? 'incoming' : 'calling',
      direction: incoming ? 'incoming' : 'outgoing',
      remoteIdentity,
      cause: undefined,
      localSdp: undefined,
      remoteSdp: undefined,
      signalingState: undefined,
      iceGatheringState: undefined,
      iceConnectionState: undefined,
      connectionState: undefined,
    });

    // JsSIP creates an outgoing call's connection, and announces it, before it
    // announces the session, so by the time the session reaches here its
    // 'peerconnection' event has already been and gone. Take the connection
    // it already has; the event covers an incoming call, whose connection is
    // created on answer.
    if (session.connection) this.observe(session.connection);
    session.on('peerconnection', (event: PeerConnectionEvent) => this.observe(event.peerconnection));
    session.on('sdp', (event: SDPEvent) => {
      this.update(event.originator === 'local' ? { localSdp: event.sdp } : { remoteSdp: event.sdp });
    });
    session.on('progress', () => {
      if (this.current.direction === 'outgoing') this.update({ call: 'ringing' });
    });
    session.on('accepted', () => this.update({ call: 'connected' }));
    session.on('confirmed', () => this.update({ call: 'connected' }));
    session.on('ended', (event: EndEvent) => this.finish('ended', event.cause));
    session.on('failed', (event: EndEvent) => this.finish('failed', event.cause));
  }

  private observe(peer: RTCPeerConnection): void {
    if (this.peer === peer) return;
    this.peer = peer;
    const snapshot = () => this.update({
      signalingState: peer.signalingState,
      iceGatheringState: peer.iceGatheringState,
      iceConnectionState: peer.iceConnectionState,
      connectionState: peer.connectionState,
    });
    peer.addEventListener('signalingstatechange', snapshot);
    peer.addEventListener('icegatheringstatechange', snapshot);
    peer.addEventListener('iceconnectionstatechange', snapshot);
    peer.addEventListener('connectionstatechange', snapshot);
    peer.addEventListener('track', (event: RTCTrackEvent) => {
      this.remote = event.streams[0] ?? new MediaStream([event.track]);
      // The stream is not part of the snapshot, so the snapshot has to be
      // re-emitted for a screen to attach it.
      this.emit();
    });
    snapshot();
  }

  private finish(call: 'ended' | 'failed', cause: string | undefined): void {
    this.session = undefined;
    this.peer = undefined;
    this.remote = undefined;
    const notice = call === 'failed' && cause ? `Call failed: ${cause}` : undefined;
    this.update({ call, cause, notice });
  }

  private stopAgent(): void {
    this.session?.terminate();
    this.session = undefined;
    this.peer = undefined;
    this.remote = undefined;
    this.agent?.stop();
    this.agent = undefined;
  }

  private reset(patch: Partial<SoftphoneState>): void {
    this.current = { ...INITIAL, ...patch };
    this.record();
    this.emit();
  }

  private update(patch: Partial<SoftphoneState>): void {
    this.current = { ...this.current, ...patch };
    this.record();
    this.emit();
  }

  private record(): void {
    const last = this.transitions[this.transitions.length - 1];
    const next: Transition = {
      at: this.clock(),
      registration: this.current.registration,
      call: this.current.call,
      iceConnectionState: this.current.iceConnectionState,
      connectionState: this.current.connectionState,
      cause: this.current.cause,
    };
    // Only a change of state is worth a row; an SDP arriving is not.
    if (last && last.registration === next.registration && last.call === next.call
      && last.iceConnectionState === next.iceConnectionState && last.connectionState === next.connectionState
      && last.cause === next.cause) return;
    this.transitions.push(next);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.current);
  }
}

/** A one-line account of a state, for an error message. */
export function describe(state: SoftphoneState): string {
  const parts = [`registration ${state.registration}`, `call ${state.call}`];
  if (state.iceConnectionState) parts.push(`ice ${state.iceConnectionState}`);
  if (state.cause) parts.push(`cause ${state.cause}`);
  return parts.join(', ');
}

/**
 * The parts of a `getStats()` report that say whether media moved and where.
 *
 * The report is a flat map of records that reference each other by id, so
 * the pair is resolved by hand: the transport names the selected pair, the
 * pair names its two candidates, and the inbound stream names its codec.
 */
export function summarise(report: RTCStatsReport): MediaStats {
  const records = new Map<string, Record<string, unknown>>();
  report.forEach((value: Record<string, unknown>, key: string) => records.set(key, value));

  const stats: MediaStats = { packetsSent: 0, packetsReceived: 0, bytesSent: 0, bytesReceived: 0, packetsLost: 0 };
  let selectedPairId: string | undefined;

  for (const record of records.values()) {
    switch (record.type) {
      case 'outbound-rtp':
        stats.packetsSent += number(record.packetsSent);
        stats.bytesSent += number(record.bytesSent);
        break;
      case 'inbound-rtp': {
        stats.packetsReceived += number(record.packetsReceived);
        stats.bytesReceived += number(record.bytesReceived);
        stats.packetsLost += number(record.packetsLost);
        if (typeof record.audioLevel === 'number') stats.audioLevel = record.audioLevel;
        if (typeof record.totalAudioEnergy === 'number') stats.totalAudioEnergy = (stats.totalAudioEnergy ?? 0) + record.totalAudioEnergy;
        const codec = typeof record.codecId === 'string' ? records.get(record.codecId) : undefined;
        if (codec && typeof codec.mimeType === 'string') stats.codec = codec.mimeType;
        break;
      }
      case 'transport':
        if (typeof record.dtlsState === 'string') stats.dtlsState = record.dtlsState;
        if (typeof record.selectedCandidatePairId === 'string') selectedPairId = record.selectedCandidatePairId;
        break;
    }
  }

  // Firefox reports no transport record; the nominated, succeeded pair is
  // the same answer found the long way round.
  const pair = (selectedPairId && records.get(selectedPairId))
    ?? [...records.values()].find((record) => record.type === 'candidate-pair' && record.state === 'succeeded' && record.nominated === true);
  if (pair) {
    const local = typeof pair.localCandidateId === 'string' ? records.get(pair.localCandidateId) : undefined;
    const remote = typeof pair.remoteCandidateId === 'string' ? records.get(pair.remoteCandidateId) : undefined;
    if (local && remote) {
      stats.candidatePair = { local: candidate(local), remote: candidate(remote), state: String(pair.state ?? '') };
    }
  }
  return stats;
}

function candidate(record: Record<string, unknown>): CandidateEnd {
  return {
    address: String(record.address ?? record.ip ?? ''),
    port: number(record.port),
    type: String(record.candidateType ?? ''),
    protocol: String(record.protocol ?? ''),
  };
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
