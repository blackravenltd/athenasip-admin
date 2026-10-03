import { useEffect, useRef, useState } from 'react';
import type { AdminApi } from '../api/AdminApi';
import { errorMessage, isAbort } from '../api/errors';
import { VolumeMeter } from '../components/VolumeMeter';
import { usableIceServers } from '../softphone/iceServers';
import type { CallState, IceOptions, RegistrationState, SipStack } from '../softphone/Softphone';
import { jssipStack } from '../softphone/jssip';
import type { PageOptions } from '../softphone/page';
import { useSoftphone } from '../softphone/useSoftphone';

const CALL_LABELS: Record<CallState, string> = {
  idle: 'Idle',
  calling: 'Calling...',
  ringing: 'Ringing...',
  incoming: 'Incoming call',
  connected: 'Connected',
  ended: 'Call ended',
  failed: 'Call failed',
};

const REGISTRATION_LABELS: Record<RegistrationState, string> = {
  unregistered: 'Not registered',
  connecting: 'Registering...',
  registered: 'Registered',
  failed: 'Registration failed',
};

export function describeCallState(state: CallState): string {
  return CALL_LABELS[state];
}

export function describeRegistration(state: RegistrationState): string {
  return REGISTRATION_LABELS[state];
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
 * The WebSocket port a node is assumed to serve SIP on, when nothing says.
 * 8088 is what the deployed node and the interop fixture use, and what most
 * SIP servers serve WebSocket on.
 */
const DEFAULT_WS_PORT = 8088;

/**
 * Where the defaults come from.
 *
 * The page's own query string first, because that is how a harness opens it;
 * then the environment, if it says anything; then the page's own host. What
 * is typed here stays in this component. Nothing is persisted: a credential
 * in `localStorage` is a credential in every future session of this browser.
 */
export function defaultConnection(options: PageOptions): Connection {
  const socket = options.socket
    ?? import.meta.env.VITE_SIP_WS_URL
    ?? (typeof window === 'undefined'
      ? `ws://localhost:${DEFAULT_WS_PORT}`
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:${DEFAULT_WS_PORT}`);
  return {
    socket,
    uri: options.uri ?? import.meta.env.VITE_SIP_URI ?? '',
    password: options.password ?? '',
    target: options.target ?? import.meta.env.VITE_SIP_TARGET ?? '',
  };
}

const NO_OPTIONS: PageOptions = { register: false, answer: false };

/**
 * A WebRTC endpoint, for proving the server carries a call.
 *
 * This is a diagnostic, not a product: it registers against this AthenaSIP
 * node over the WebSocket transport, places or answers one call, and shows
 * what was negotiated and whether anything moved, so that "connected but
 * silent" is distinguishable from "connected". Silence is the failure mode a
 * relay misconfiguration actually produces, and a status line saying
 * "Connected" does not catch it.
 *
 * It is also the browser end of AthenaSIP's end-to-end run. The same
 * component is served on its own page for that, opened with a query string
 * and read through the window-level readout; see `docs/softphone.md`.
 */
export function SoftphoneScreen({ options = NO_OPTIONS, stack = jssipStack, api }: {
  options?: PageOptions;
  stack?: SipStack;
  /**
   * The console's node, which says where to signal and what to use for ICE.
   * The harness page has none, and keeps its query string and no ICE servers.
   */
  api?: AdminApi;
}) {
  const [connection, setConnection] = useState<Connection>(() => defaultConnection(options));
  const [configNotice, setConfigNotice] = useState<string>();
  const [iceServers, setIceServers] = useState<RTCIceServer[]>();
  const [relayOnly, setRelayOnly] = useState(false);
  const { phone, state, remoteStream, stats } = useSoftphone(stack, options);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playbackNotice, setPlaybackNotice] = useState<string>();
  // Undefined where the browser does not say, as in a test; only a plain no stops the phone.
  const insecure = window.isSecureContext === false;

  // Where to signal, from the node, unless the query string or the environment said.
  // Only replaces the guessed default, never something already typed.
  useEffect(() => {
    if (!api || options.socket || import.meta.env.VITE_SIP_WS_URL) return;
    const guessed = defaultConnection(options).socket;
    const controller = new AbortController();
    api.clientConfig(controller.signal).then((config) => {
      if (config.websocket_uri) {
        const uri = config.websocket_uri;
        setConnection((current) => (current.socket === guessed ? { ...current, socket: uri } : current));
      } else if (window.location.protocol === 'https:') {
        setConfigNotice('This node has no secure WebSocket listener, so a page served over https cannot reach it.');
      }
    }).catch((cause: unknown) => {
      if (!isAbort(cause)) setConfigNotice(`Could not read the node's client configuration: ${errorMessage(cause)}`);
    });
    return () => controller.abort();
    // The options are the page's, fixed for its life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  /**
   * TURN credentials are minted per request and expire, so they are fetched as
   * the call is placed or answered, never held from earlier. Without the node's
   * answer the call still goes ahead with none, as the harness page's does.
   */
  const withIceServers = (place: (ice?: IceOptions) => void) => {
    if (!api) {
      // The page's own `ice` and `relay`, which the phone already holds.
      if (options.ice) setIceServers(usableIceServers(options.ice));
      place();
      return;
    }
    api.clientConfig().then(
      (config) => usableIceServers(config.ice_servers),
      (cause: unknown) => {
        setConfigNotice(`No ICE servers from the node, calling without: ${errorMessage(cause)}`);
        return [];
      },
    ).then((servers) => {
      setIceServers(servers);
      place({ servers, relayOnly });
    });
  };
  useEffect(() => {
    const element = audioRef.current;
    if (!element || !remoteStream) return;
    element.srcObject = remoteStream;
    void element.play().catch((cause: unknown) => setPlaybackNotice(`Audio playback refused: ${String(cause)}`));
  }, [remoteStream]);

  const busy = state.registration === 'connecting';
  const registered = state.registration === 'registered';
  const inCall = callInProgress(state.call);

  const field = (key: keyof Connection, label: string, type = 'text') => (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={connection[key]}
        disabled={registered || busy}
        spellCheck={false}
        autoComplete={type === 'password' ? 'off' : 'on'}
        data-testid={`softphone-${key}`}
        onChange={(event) => setConnection((current) => ({ ...current, [key]: event.target.value }))}
      />
    </label>
  );

  const notice = state.notice ?? playbackNotice ?? configNotice;
  const pair = stats?.candidatePair;

  return (
    <>
      <h1>Softphone</h1>

      <section className="panel softphone">
        <div className="panel-heading">
          <div>
            <h2>WebRTC endpoint</h2>
            <p>
              Registers against this node over the WebSocket transport and places one call, so
              that signalling and media can be proven end to end from a browser. The negotiation
              readout and the levels below are what catch a call that connects and then carries
              no audio.
            </p>
          </div>
        </div>

        <div className="field-row">
          {field('socket', 'WebSocket URL')}
          {field('uri', 'SIP URI')}
          {field('password', 'Password', 'password')}
          {field('target', 'Call target')}
        </div>
        {api && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={relayOnly}
              disabled={inCall}
              data-testid="softphone-relay-only"
              onChange={(event) => setRelayOnly(event.target.checked)}
            />
            <span>Relay only: send media through the node's TURN server even when a direct path exists, to prove TURN works</span>
          </label>
        )}
        <p className="field-hint">
          Nothing typed here is stored. The password is held in this page only, and is gone on
          reload.
        </p>

        <div className="button-row">
          {!registered ? (
            <button
              className="primary-button"
              type="button"
              data-testid="softphone-register"
              onClick={() => phone.register({ socket: connection.socket, uri: connection.uri, password: connection.password })}
              disabled={insecure || busy || !connection.socket || !connection.uri}
            >
              {busy ? 'Registering...' : 'Register'}
            </button>
          ) : (
            <>
              <button
                className="primary-button"
                type="button"
                data-testid="softphone-call"
                onClick={() => withIceServers((ice) => phone.call(connection.target, ice))}
                disabled={inCall || !connection.target}
              >
                Call
              </button>
              {state.call === 'incoming' && (
                <button className="primary-button" type="button" data-testid="softphone-answer" onClick={() => withIceServers((ice) => phone.answer(ice))}>
                  Answer
                </button>
              )}
              <button
                className="secondary-button danger-button"
                type="button"
                data-testid="softphone-hangup"
                onClick={() => phone.hangUp()}
                disabled={!inCall}
              >
                Hang up
              </button>
              <button className="secondary-button" type="button" data-testid="softphone-unregister" onClick={() => phone.unregister()}>
                Unregister
              </button>
            </>
          )}
        </div>

        <p className="call-state">
          <span className={`state-dot state-${registered ? 'ok' : state.registration === 'failed' ? 'down' : 'warn'}`} aria-hidden="true" />
          <span role="status" data-testid="softphone-registration" data-state={state.registration}>
            {describeRegistration(state.registration)}
          </span>
          {registered && (
            <span role="status" data-testid="softphone-call-state" data-state={state.call}>
              {describeCallState(state.call)}
              {state.remoteIdentity && state.call !== 'idle' ? ` (${state.remoteIdentity})` : ''}
            </span>
          )}
        </p>
        {insecure && (
          <p className="error-message" role="alert" data-testid="softphone-insecure">
            This page is not a secure context, so the browser will not give it a microphone and no
            call can start. Open the console over https, or through localhost.
          </p>
        )}
        {notice && <p className="error-message" role="alert">{notice}</p>}

        <audio ref={audioRef} autoPlay hidden playsInline />
        <VolumeMeter label="Far end" source={{ kind: 'stream', stream: remoteStream }} active={state.call === 'connected'} />
        <VolumeMeter label="Microphone" source={{ kind: 'microphone' }} active={registered} />
      </section>

      {state.call !== 'idle' && (
        <section className="panel softphone" aria-labelledby="negotiation-heading">
          <div className="panel-heading">
            <div>
              <h2 id="negotiation-heading">Negotiation</h2>
              <p>
                What the browser and the node agreed, and whether anything is moving. The
                candidate pair says where this browser is actually sending its media.
              </p>
            </div>
          </div>

          <dl className="readout" data-testid="softphone-negotiation">
            <dt>Direction</dt><dd>{state.direction ?? '-'}</dd>
            {iceServers && (<><dt>ICE servers</dt><dd data-testid="softphone-ice-servers">{iceServers.length ? iceServers.map((server) => server.urls).join(', ') : 'None'}{relayOnly || (!api && options.relay) ? ', relay only' : ''}</dd></>)}
            <dt>Signaling</dt><dd>{state.signalingState ?? '-'}</dd>
            <dt>ICE gathering</dt><dd>{state.iceGatheringState ?? '-'}</dd>
            <dt>ICE connection</dt><dd data-testid="softphone-ice">{state.iceConnectionState ?? '-'}</dd>
            <dt>Connection</dt><dd>{state.connectionState ?? '-'}</dd>
            <dt>DTLS</dt><dd>{stats?.dtlsState ?? '-'}</dd>
            <dt>Codec</dt><dd>{stats?.codec ?? '-'}</dd>
            <dt>Candidate pair</dt>
            <dd>
              {pair
                ? `${pair.local.address}:${pair.local.port} (${pair.local.type}) to ${pair.remote.address}:${pair.remote.port} (${pair.remote.type}), ${pair.state}`
                : '-'}
            </dd>
            <dt>Packets</dt>
            <dd>
              {stats
                ? `${stats.packetsSent} sent, ${stats.packetsReceived} received, ${stats.packetsLost} lost`
                : '-'}
            </dd>
            {state.cause && (<><dt>Cause</dt><dd>{state.cause}</dd></>)}
          </dl>

          <details>
            <summary>Local description</summary>
            <pre className="sdp" data-testid="softphone-local-sdp">{state.localSdp ?? 'None yet.'}</pre>
          </details>
          <details>
            <summary>Remote description</summary>
            <pre className="sdp" data-testid="softphone-remote-sdp">{state.remoteSdp ?? 'None yet.'}</pre>
          </details>
        </section>
      )}
    </>
  );
}
