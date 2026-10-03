/**
 * A WebRTC endpoint over SIP, with nothing of React in it.
 *
 * This is the whole of what the softphone does: register one subscriber against
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
import type { DTMF_TRANSPORT } from 'jssip/lib/Constants';
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
  /**
   * This end's accumulated microphone energy, from the media source the call
   * sends. A connected call whose figure stands still is sending silence:
   * a muted, missing or virtual microphone.
   */
  sentAudioEnergy?: number;
  codec?: string;
  /** The video stream's own counters, kept apart so the audio figures above stay audio's. */
  video?: VideoStats;
  dtlsState?: string;
  candidatePair?: { local: CandidateEnd; remote: CandidateEnd; state: string };
}

/** What the browser counted for video, when a call carries any. */
export interface VideoStats {
  packetsSent: number;
  packetsReceived: number;
  framesDecoded: number;
  codec?: string;
}

/** One description's video m-line: its port, 0 for declined, and its direction attribute. */
export interface VideoLine {
  port: number;
  direction: 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive';
  /** In the session's BUNDLE group, so it shares a transport and its own port may be a placeholder. */
  bundled: boolean;
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
  /** When the call was answered, by the controller's clock: what a call timer counts from. */
  connectedAt?: number;
  /** This end's microphone is muted on the call. */
  muted?: boolean;
  /** This end put the call on hold. */
  held?: boolean;
  /** The far end put the call on hold. */
  heldByFarEnd?: boolean;
  /** A message for the person at the keyboard, when something needs saying. */
  notice?: string;
}

/** What a call sends: whether there is video, and which devices, by `deviceId`, when not the default. */
export interface CallMedia {
  video?: boolean;
  microphone?: string;
  camera?: string;
}

/** The keys a dial pad sends: RFC 4733 events 0 to 15. */
export const DTMF_TONES = '0123456789*#ABCD';

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

function constraints({ video, microphone, camera }: CallMedia): MediaStreamConstraints {
  return {
    audio: microphone ? { deviceId: { exact: microphone } } : true,
    video: video ? (camera ? { deviceId: { exact: camera } } : true) : false,
  };
}

export class Softphone {
  private current: SoftphoneState = INITIAL;
  private readonly listeners = new Set<Listener>();
  private readonly transitions: Transition[] = [];
  private agent?: UA;
  private session?: RTCSession;
  private peer?: RTCPeerConnection;
  private remote?: MediaStream;
  private local?: MediaStream;
  private ice: IceOptions = NO_ICE;

  constructor(private readonly sip: SipStack, private readonly clock: () => number = Date.now) {
    this.record();
  }

  get state(): SoftphoneState {
    return this.current;
  }

  /** The far end's audio and video, once there is any. */
  get remoteStream(): MediaStream | undefined {
    return this.remote;
  }

  /** What this end is sending, once the call has its tracks: the camera's picture, for one. */
  get localStream(): MediaStream | undefined {
    return this.local;
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

  /** Video is asked for, never assumed: the harness page's calls are audio only. */
  call(target: string, ice: IceOptions = this.ice, media: CallMedia = {}): void {
    if (!this.agent || this.session) return;
    this.update({ notice: undefined, cause: undefined });
    try {
      this.agent.call(target, {
        mediaConstraints: constraints(media),
        pcConfig: peerConfiguration(ice.servers, ice.relayOnly ?? false),
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: media.video ?? false },
      });
    } catch (cause) {
      this.update({ call: 'failed', notice: `Could not call: ${String(cause)}` });
    }
  }

  /** Without video, the browser answers an offered video line receive-only: it shows the far end's camera and sends none. */
  answer(ice: IceOptions = this.ice, media: CallMedia = {}): void {
    if (!this.session || this.current.call !== 'incoming') return;
    this.session.answer({ mediaConstraints: constraints(media), pcConfig: peerConfiguration(ice.servers, ice.relayOnly ?? false) });
  }

  /** Stops or restarts sending the microphone, without renegotiating. */
  mute(on: boolean): void {
    if (!this.session || this.current.call !== 'connected') return;
    if (on) this.session.mute({ audio: true });
    else this.session.unmute({ audio: true });
    this.update({ muted: on });
  }

  /** Puts the call on hold with a re-INVITE, or takes it off. */
  hold(on: boolean): void {
    if (!this.session || this.current.call !== 'connected') return;
    const accepted = on ? this.session.hold() : this.session.unhold();
    if (accepted) this.update({ held: on });
  }

  /**
   * Sends one dial pad key as an RFC 4733 telephone event in the media, the
   * way a phone menu at the far end expects it, rather than as SIP INFO
   * through the node.
   */
  sendDtmf(tone: string): void {
    if (!this.session || this.current.call !== 'connected') return;
    if (tone.length !== 1 || !DTMF_TONES.includes(tone.toUpperCase())) return;
    this.session.sendDTMF(tone.toUpperCase(), { transportType: 'RFC2833' as DTMF_TRANSPORT });
  }

  hangUp(): void {
    this.session?.terminate();
  }

  /** Refuses a call that is still ringing here with 603 Decline, which says nobody will take it. */
  decline(): void {
    if (!this.session || this.current.call !== 'incoming') return;
    this.session.terminate({ status_code: 603, reason_phrase: 'Decline' });
  }

  /** The browser's own report of the media, or nothing when there is no connection to ask. */
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
      muted: false,
      held: false,
      heldByFarEnd: false,
      connectedAt: undefined,
    });

    // JsSIP creates an outgoing call's connection, and announces it, before it
    // announces the session, so by the time the session reaches here its
    // 'peerconnection' event has already been and gone. Take the connection
    // it already has; the event covers an incoming call, whose connection is
    // created on answer.
    if (session.connection) this.observe(session.connection);
    session.on('peerconnection', (event: PeerConnectionEvent) => this.observe(event.peerconnection));
    session.on('sdp', (event: SDPEvent) => {
      // By the local description the tracks are on the connection, so this is
      // when there is something of our own to show.
      if (event.originator === 'local') this.local = senderStream(this.peer ?? session.connection);
      this.update(event.originator === 'local' ? { localSdp: event.sdp } : { remoteSdp: event.sdp });
    });
    session.on('progress', () => {
      if (this.current.direction === 'outgoing') this.update({ call: 'ringing' });
    });
    session.on('hold', (event: { originator: string }) => this.update(event.originator === 'remote' ? { heldByFarEnd: true } : { held: true }));
    session.on('unhold', (event: { originator: string }) => this.update(event.originator === 'remote' ? { heldByFarEnd: false } : { held: false }));
    const connected = () => this.update({ call: 'connected', connectedAt: this.current.connectedAt ?? this.clock() });
    session.on('accepted', connected);
    session.on('confirmed', connected);
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
      // Audio and video arrive as two events. With no stream named, the second
      // joins the first rather than replacing it.
      if (event.streams[0]) this.remote = event.streams[0];
      else if (this.remote) this.remote.addTrack(event.track);
      else this.remote = new MediaStream([event.track]);
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
    this.local = undefined;
    const notice = call === 'failed' && cause ? `Call failed: ${cause}` : undefined;
    this.update({ call, cause, notice });
  }

  private stopAgent(): void {
    this.session?.terminate();
    this.session = undefined;
    this.peer = undefined;
    this.remote = undefined;
    this.local = undefined;
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

/** A one-line description of a state, for an error message. */
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
  const video = (): VideoStats => (stats.video ??= { packetsSent: 0, packetsReceived: 0, framesDecoded: 0 });

  for (const record of records.values()) {
    switch (record.type) {
      case 'outbound-rtp':
        if (record.kind === 'video') {
          video().packetsSent += number(record.packetsSent);
          break;
        }
        stats.packetsSent += number(record.packetsSent);
        stats.bytesSent += number(record.bytesSent);
        break;
      case 'inbound-rtp': {
        if (record.kind === 'video') {
          video().packetsReceived += number(record.packetsReceived);
          video().framesDecoded += number(record.framesDecoded);
          const codec = typeof record.codecId === 'string' ? records.get(record.codecId) : undefined;
          if (codec && typeof codec.mimeType === 'string') video().codec = codec.mimeType;
          break;
        }
        stats.packetsReceived += number(record.packetsReceived);
        stats.bytesReceived += number(record.bytesReceived);
        stats.packetsLost += number(record.packetsLost);
        if (typeof record.audioLevel === 'number') stats.audioLevel = record.audioLevel;
        if (typeof record.totalAudioEnergy === 'number') stats.totalAudioEnergy = (stats.totalAudioEnergy ?? 0) + record.totalAudioEnergy;
        const codec = typeof record.codecId === 'string' ? records.get(record.codecId) : undefined;
        if (codec && typeof codec.mimeType === 'string') stats.codec = codec.mimeType;
        break;
      }
      case 'media-source':
        if (record.kind === 'audio' && typeof record.totalAudioEnergy === 'number') {
          stats.sentAudioEnergy = (stats.sentAudioEnergy ?? 0) + record.totalAudioEnergy;
        }
        break;
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

/** The tracks a connection is sending, as one stream to show; nothing when it sends no video. */
function senderStream(peer: RTCPeerConnection | undefined): MediaStream | undefined {
  if (!peer || typeof MediaStream === 'undefined') return undefined;
  const tracks = peer.getSenders().map((sender) => sender.track).filter((track): track is MediaStreamTrack => !!track);
  return tracks.some((track) => track.kind === 'video') ? new MediaStream(tracks) : undefined;
}

/**
 * A description's video m-line, or nothing when it has none.
 *
 * Port 0 is a decline, whatever the attributes say (RFC 3264). The direction
 * defaults to sendrecv when the section names none, as it does at session
 * level too.
 */
export function videoLine(sdp: string | undefined): VideoLine | undefined {
  if (!sdp) return undefined;
  const sections = sdp.split(/\r?\n(?=m=)/);
  const section = sections.find((candidate) => candidate.startsWith('m=video '));
  if (!section) return undefined;
  const port = Number(/^m=video (\d+)/.exec(section)?.[1] ?? 0);
  const named = /^a=(sendrecv|sendonly|recvonly|inactive)\s*$/m.exec(section)?.[1] as VideoLine['direction'] | undefined;
  const mid = /^a=mid:(\S+)/m.exec(section)?.[1];
  const group = /^a=group:BUNDLE((?: \S+)*)\s*$/m.exec(sections[0])?.[1].trim().split(' ') ?? [];
  return { port, direction: named ?? 'sendrecv', bundled: mid !== undefined && group.includes(mid) };
}
