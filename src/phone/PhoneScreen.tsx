import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AdminApi } from '../api/AdminApi';
import { errorMessage, isAbort } from '../api/errors';
import { CallReadout } from '../softphone/CallReadout';
import { callInProgress, describeCallState, signallingUri } from '../softphone/words';
import { DialPad } from './DialPad';
import { callTimer, dialTarget, userOf } from './dial';
import { loadSettings, saveSettings, type PhoneSettings } from './settings';
import type { PhoneHandle } from './usePhone';

/** The WebSocket a node is assumed to serve SIP on when nothing says. */
function guessedSocket(): string {
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8088`;
}

/**
 * The console's phone.
 *
 * It signs in to SIP as a subscriber, separately from the console's own
 * sign-in: the user managing the cluster and the phone ringing on the desk are
 * different things. The shell owns the phone, so a call carries on while the
 * console's other screens are used; this screen is only its face.
 *
 * `aside` is where history and the directory go, beside the dialler.
 */
export function PhoneScreen({ api, handle, settings, onSettings, aside }: {
  api: AdminApi;
  handle: PhoneHandle;
  settings: PhoneSettings;
  onSettings: (settings: PhoneSettings) => void;
  aside?: ReactNode;
}) {
  const { phone, state, stats, localStream, remoteStream, iceNotice } = handle;
  const [uri, setUri] = useState(settings.uri ?? '');
  const [password, setPassword] = useState('');
  const [socket, setSocket] = useState(settings.socket ?? '');
  const [socketNotice, setSocketNotice] = useState<string>();
  const [target, setTarget] = useState('');
  const [tones, setTones] = useState('');
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);

  const registered = state.registration === 'registered';
  const registering = state.registration === 'connecting';
  const inCall = callInProgress(state.call);
  const connected = state.call === 'connected';
  const insecure = window.isSecureContext === false;
  const dialled = dialTarget(target, uri);
  const remoteHasVideo = !!remoteStream?.getVideoTracks?.().length;

  // Where to signal, from the node, unless this browser remembers somewhere.
  useEffect(() => {
    if (socket) return;
    const controller = new AbortController();
    const https = window.location.protocol === 'https:';
    api.clientConfig(controller.signal).then((config) => {
      setSocket((current) => current || signallingUri(config, https) || guessedSocket());
    }).catch((cause: unknown) => {
      if (isAbort(cause)) return;
      setSocket((current) => current || guessedSocket());
      setSocketNotice(`Could not ask the node where to connect, so this is a guess: ${errorMessage(cause)}`);
    });
    return () => controller.abort();
    // Asked once, for a socket nobody has chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    if (remoteVideo.current) remoteVideo.current.srcObject = remoteHasVideo ? remoteStream ?? null : null;
  }, [remoteStream, remoteHasVideo]);
  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = localStream ?? null;
  }, [localStream]);
  useEffect(() => {
    if (!inCall) setTones('');
  }, [inCall]);

  const register = () => {
    onSettings({ ...settings, uri, socket });
    phone.register({ socket, uri, password });
  };

  const media = (video: boolean) => ({ video, microphone: settings.microphone, camera: settings.camera });

  const press = (key: string) => {
    if (connected) {
      phone.sendDtmf(key);
      setTones((current) => current + key);
    } else if (!inCall) {
      setTarget((current) => current + key);
    }
  };

  // Keys typed while connected go to the far end as tones, unless a field has focus.
  useEffect(() => {
    if (!connected) return;
    const onKey = (event: KeyboardEvent) => {
      const field = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if (field || event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[0-9*#]$/.test(event.key)) press(event.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `press` reads only what changes with `connected`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const notice = state.notice ?? iceNotice;

  return (
    <>
      <h1>Phone</h1>

      <section className="panel" aria-labelledby="phone-line-heading">
        <div className="panel-heading">
          <div>
            <h2 id="phone-line-heading">{registered ? `Registered as ${userOf(uri)}` : 'Sign in to a line'}</h2>
            <p>
              This browser becomes a phone by registering as one of a realm&apos;s subscribers, the
              way a desk phone does. That is separate from your console sign-in. The address and
              connection are remembered here; the password never is.
            </p>
          </div>
          {registered && (
            <button className="secondary-button" type="button" onClick={() => phone.unregister()}>Sign out of the line</button>
          )}
        </div>

        {insecure && (
          <p className="error-message" role="alert">
            This page is not a secure context, so the browser will not give it a microphone and no
            call can start. Open the console over https.
          </p>
        )}

        {!registered && (
          <form
            className="phone-line-form"
            onSubmit={(event) => { event.preventDefault(); register(); }}
          >
            <label className="field">
              <span>SIP address</span>
              <input value={uri} onChange={(event) => setUri(event.target.value)} placeholder="sip:1001@sip.example.org" autoComplete="username" />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
            </label>
            <details className="phone-connection">
              <summary>Connection</summary>
              <label className="field">
                <span>WebSocket</span>
                <input value={socket} onChange={(event) => setSocket(event.target.value)} />
              </label>
              {socketNotice && <p className="field-hint">{socketNotice}</p>}
            </details>
            <div className="dialog-actions">
              <button className="primary-button" type="submit" disabled={insecure || registering || !socket || !uri}>
                {registering ? 'Registering...' : 'Register'}
              </button>
            </div>
          </form>
        )}
        {!registered && state.registration === 'failed' && state.notice && (
          <p className="error-message" role="alert">{state.notice}</p>
        )}
      </section>

      {registered && (
        <div className="phone-layout">
          <section className="panel phone-dialler" aria-label="Dialler">
            {state.call !== 'idle' && (
              <div className={`phone-call phone-call-${state.call}`} role="status" aria-live="polite">
                <span className="phone-call-who">{userOf(state.remoteIdentity)}</span>
                <span className="phone-call-state">
                  {describeCallState(state.call)}
                  {connected && state.connectedAt !== undefined ? `, ${callTimer(Date.now() - state.connectedAt)}` : ''}
                  {state.held ? ', on hold' : ''}
                  {state.heldByFarEnd ? ', held by the far end' : ''}
                  {state.muted ? ', muted' : ''}
                </span>
                {state.remoteIdentity && <code className="phone-call-uri">{state.remoteIdentity}</code>}
              </div>
            )}

            {state.call === 'incoming' && (
              <div className="phone-actions">
                <button className="primary-button" type="button" onClick={() => handle.answer(media(false))}>Answer</button>
                <button className="secondary-button" type="button" onClick={() => handle.answer(media(true))}>Answer with video</button>
                <button className="secondary-button danger-button" type="button" onClick={() => phone.decline()}>Decline</button>
              </div>
            )}

            {!inCall && (
              <label className="field">
                <span>Number or address</span>
                <input
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && dialled) handle.call(dialled, media(false)); }}
                  placeholder="1002, or bob@example.org"
                  aria-label="Number or address"
                />
              </label>
            )}
            {connected && tones && <p className="phone-tones" aria-label="Tones sent">{tones}</p>}

            {(!inCall || connected) && <DialPad label={connected ? 'Send tones' : 'Dial pad'} onKey={press} />}

            {!inCall && (
              <div className="phone-actions">
                <button className="primary-button" type="button" disabled={!dialled} onClick={() => dialled && handle.call(dialled, media(false))}>Call</button>
                <button className="secondary-button" type="button" disabled={!dialled} onClick={() => dialled && handle.call(dialled, media(true))}>Video call</button>
                {target && <button className="secondary-button" type="button" onClick={() => setTarget('')}>Clear</button>}
              </div>
            )}

            {inCall && state.call !== 'incoming' && (
              <div className="phone-actions">
                <button className="secondary-button" type="button" aria-pressed={!!state.muted} disabled={!connected} onClick={() => phone.mute(!state.muted)}>
                  {state.muted ? 'Unmute' : 'Mute'}
                </button>
                <button className="secondary-button" type="button" aria-pressed={!!state.held} disabled={!connected} onClick={() => phone.hold(!state.held)}>
                  {state.held ? 'Resume' : 'Hold'}
                </button>
                <button className="primary-button danger-button" type="button" onClick={() => phone.hangUp()}>Hang up</button>
              </div>
            )}

            {(localStream || remoteHasVideo) && (
              <div className="softphone-video">
                <figure>
                  <video ref={remoteVideo} autoPlay playsInline muted aria-label="Far end video" />
                  <figcaption>{userOf(state.remoteIdentity)}</figcaption>
                </figure>
                <figure>
                  <video ref={localVideo} autoPlay playsInline muted aria-label="Your video" />
                  <figcaption>You</figcaption>
                </figure>
              </div>
            )}

            {notice && state.registration === 'registered' && <p className="error-message" role="alert">{notice}</p>}
          </section>

          {aside}
        </div>
      )}

      {state.call !== 'idle' && (
        <section className="panel softphone">
          <details>
            <summary>Call details</summary>
            <CallReadout state={state} stats={stats} />
          </details>
        </section>
      )}
    </>
  );
}

/** The settings as they stand, and a setter that remembers them. */
export function useRememberedSettings(): [PhoneSettings, (settings: PhoneSettings) => void] {
  const [settings, setSettings] = useState<PhoneSettings>(() => loadSettings());
  const update = (next: PhoneSettings) => {
    setSettings(next);
    saveSettings(next);
  };
  return [settings, update];
}
