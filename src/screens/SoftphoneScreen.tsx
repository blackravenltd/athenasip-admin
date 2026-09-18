import { useEffect, useRef, useState } from 'react';
import JsSIP from 'jssip';
import type { RTCSession } from 'jssip/lib/RTCSession';
import { VolumeMeter } from '../components/VolumeMeter';

export type CallState = 'idle' | 'calling' | 'ringing' | 'incoming' | 'connected' | 'ended' | 'failed';

const STATE_LABELS: Record<CallState, string> = {
  idle: 'Idle',
  calling: 'Calling...',
  ringing: 'Ringing...',
  incoming: 'Incoming call',
  connected: 'Connected',
  ended: 'Call ended',
  failed: 'Call failed',
};

export function describeCallState(state: CallState): string {
  return STATE_LABELS[state];
}

/** Whether a call is in progress, in the sense of "there is something to hang up". */
export function callInProgress(state: CallState): boolean {
  return state === 'calling' || state === 'ringing' || state === 'incoming' || state === 'connected';
}

interface Connection {
  socket: string;
  uri: string;
  password: string;
  target: string;
}

/**
 * Where the defaults come from.
 *
 * They used to be four constants compiled into the bundle, one of which was a
 * password. Now they are seeded from the environment if it says anything and
 * from the page's own host otherwise, and whatever is typed here stays in this
 * component. Nothing is persisted: a credential in `localStorage` is a
 * credential in every future session of this browser.
 */
function defaultConnection(): Connection {
  const socket = import.meta.env.VITE_SIP_WS_URL
    ?? (typeof window === 'undefined'
      ? 'ws://localhost:9500'
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:9500`);
  return {
    socket,
    uri: import.meta.env.VITE_SIP_URI ?? '',
    password: '',
    target: import.meta.env.VITE_SIP_TARGET ?? '',
  };
}

/**
 * A WebRTC endpoint, for proving the server carries a call.
 *
 * This is a diagnostic, not a product: it registers against this AthenaSIP
 * node over the WebSocket transport, places or answers one call, and shows the
 * level in each direction so that "connected but silent" is distinguishable
 * from "connected". Silence is the failure mode a relay misconfiguration
 * actually produces, and a status line saying "Connected" does not catch it.
 *
 * The user agent is created on connect and destroyed on disconnect rather than
 * at module scope. The previous version built one when the module was
 * imported, so merely loading the bundle started a registration attempt
 * against localhost, and its effect was keyed on the session, which stopped
 * and restarted the whole agent every time a call changed state.
 */
export function SoftphoneScreen() {
  const [connection, setConnection] = useState<Connection>(defaultConnection);
  const [registered, setRegistered] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [state, setState] = useState<CallState>('idle');
  const [notice, setNotice] = useState<string>();
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const agentRef = useRef<JsSIP.UA>(null);
  const sessionRef = useRef<RTCSession>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // The meter needs the element itself, and a ref does not re-render when it
  // is attached. This is the one place that matters, so it is a state copy
  // rather than a callback ref threaded through everything.
  useEffect(() => setAudioElement(audioRef.current), []);

  // Whatever happens, do not leave a registration behind when the page changes.
  useEffect(() => () => {
    sessionRef.current?.terminate();
    agentRef.current?.stop();
  }, []);

  const attachSession = (session: RTCSession, incoming: boolean) => {
    sessionRef.current = session;
    setState(incoming ? 'incoming' : 'calling');

    session.on('progress', () => setState('ringing'));
    session.on('confirmed', () => {
      setState('connected');
      const [remote] = session.connection?.getReceivers?.()
        .map((receiver) => receiver.track)
        .filter((track): track is MediaStreamTrack => Boolean(track)) ?? [];
      if (remote && audioRef.current) {
        audioRef.current.srcObject = new MediaStream([remote]);
        void audioRef.current.play().catch((cause: unknown) => setNotice(`Audio playback refused: ${String(cause)}`));
      }
    });
    session.on('ended', () => { sessionRef.current = null; setState('ended'); });
    session.on('failed', (event: { cause?: string }) => {
      sessionRef.current = null;
      setState('failed');
      if (event?.cause) setNotice(`Call failed: ${event.cause}`);
    });
  };

  const connect = () => {
    setNotice(undefined);
    setConnecting(true);
    try {
      const agent = new JsSIP.UA({
        sockets: [new JsSIP.WebSocketInterface(connection.socket)],
        uri: connection.uri,
        password: connection.password,
      });
      agent.on('registered', () => { setConnecting(false); setRegistered(true); });
      agent.on('unregistered', () => setRegistered(false));
      agent.on('registrationFailed', (event: { cause?: string }) => {
        setConnecting(false);
        setRegistered(false);
        setNotice(`Registration failed: ${event?.cause ?? 'no reason given'}`);
      });
      agent.on('disconnected', () => { setConnecting(false); setRegistered(false); });
      agent.on('newRTCSession', (event: { session: RTCSession; originator: string }) => {
        // One call at a time. A second arriving while one is up is rejected
        // rather than silently replacing it.
        if (sessionRef.current && sessionRef.current !== event.session) {
          event.session.terminate();
          return;
        }
        attachSession(event.session, event.originator === 'remote');
      });
      agent.start();
      agentRef.current = agent;
    } catch (cause) {
      setConnecting(false);
      setNotice(`Could not start: ${String(cause)}`);
    }
  };

  const disconnect = () => {
    sessionRef.current?.terminate();
    sessionRef.current = null;
    agentRef.current?.stop();
    agentRef.current = null;
    setRegistered(false);
    setState('idle');
  };

  const call = () => {
    if (!agentRef.current || sessionRef.current) return;
    setNotice(undefined);
    agentRef.current.call(connection.target, {
      mediaConstraints: { audio: true, video: false },
      rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
    });
  };

  const answer = () => sessionRef.current?.answer({ mediaConstraints: { audio: true, video: false } });
  const hangUp = () => sessionRef.current?.terminate();

  const field = (key: keyof Connection, label: string, type = 'text') => (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={connection[key]}
        disabled={registered || connecting}
        spellCheck={false}
        autoComplete={type === 'password' ? 'off' : 'on'}
        onChange={(event) => setConnection((current) => ({ ...current, [key]: event.target.value }))}
      />
    </label>
  );

  return (
    <>
      <h1>Softphone</h1>

      <section className="panel softphone">
        <div className="panel-heading">
          <div>
            <h2>WebRTC endpoint</h2>
            <p>
              Registers against this node over the WebSocket transport and places one call, so
              that signalling and media can be proven end to end from a browser. The levels
              below are what catch a call that connects and then carries no audio.
            </p>
          </div>
        </div>

        <div className="field-row">
          {field('socket', 'WebSocket URL')}
          {field('uri', 'SIP URI')}
          {field('password', 'Password', 'password')}
          {field('target', 'Call target')}
        </div>
        <p className="field-hint">
          Nothing typed here is stored. The password is held in this page only, and is gone on
          reload.
        </p>

        <div className="button-row">
          {!registered ? (
            <button
              className="primary-button"
              type="button"
              onClick={connect}
              disabled={connecting || !connection.socket || !connection.uri}
            >
              {connecting ? 'Registering...' : 'Register'}
            </button>
          ) : (
            <>
              <button className="primary-button" type="button" onClick={call} disabled={callInProgress(state) || !connection.target}>
                Call
              </button>
              {state === 'incoming' && (
                <button className="primary-button" type="button" onClick={answer}>Answer</button>
              )}
              <button className="secondary-button danger-button" type="button" onClick={hangUp} disabled={!callInProgress(state)}>
                Hang up
              </button>
              <button className="secondary-button" type="button" onClick={disconnect}>Unregister</button>
            </>
          )}
        </div>

        <p className="call-state">
          <span className={`state-dot state-${registered ? 'ok' : 'warn'}`} aria-hidden="true" />
          <span role="status">{registered ? describeCallState(state) : 'Not registered'}</span>
        </p>
        {notice && <p className="error-message" role="alert">{notice}</p>}

        <audio ref={audioRef} autoPlay hidden playsInline />
        <VolumeMeter label="Far end" source={{ kind: 'element', element: audioElement }} active={state === 'connected'} />
        <VolumeMeter label="Microphone" source={{ kind: 'microphone' }} active={registered} />
      </section>
    </>
  );
}
