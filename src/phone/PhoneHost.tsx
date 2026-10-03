import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { AdminApi } from '../api/AdminApi';
import { routes } from '../app/routes';
import { jssipStack } from '../softphone/jssip';
import type { SipStack } from '../softphone/Softphone';
import { describeCallState } from '../softphone/words';
import { callTimer, userOf } from './dial';
import { PhoneScreen, useRememberedSettings } from './PhoneScreen';
import { usePhone } from './usePhone';

/**
 * The phone as the shell holds it.
 *
 * Mounted the first time someone opens the Phone section and kept until they
 * sign out of the console, so a call is not dropped by looking at another
 * screen. It plays the far end's audio from here, not from the Phone screen,
 * for the same reason, and puts a call indicator in the top bar (`indicator`,
 * a slot the shell owns) so a call is never out of sight.
 *
 * Loaded on demand, because JsSIP is most of the bundle.
 */
export default function PhoneHost({ api, visible, indicator, stack = jssipStack }: {
  api: AdminApi;
  visible: boolean;
  indicator: HTMLElement | null;
  stack?: SipStack;
}) {
  const handle = usePhone(stack, api);
  const [settings, setSettings] = useRememberedSettings();
  const audio = useRef<HTMLAudioElement>(null);
  const { state, remoteStream } = handle;

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    element.srcObject = remoteStream ?? null;
    if (remoteStream) void element.play().catch(() => undefined);
  }, [remoteStream]);

  const call = state.call === 'idle' || state.call === 'ended' || state.call === 'failed' ? undefined : state.call;

  return (
    <>
      <audio ref={audio} autoPlay hidden playsInline />
      {visible && <PhoneScreen api={api} handle={handle} settings={settings} onSettings={setSettings} />}
      {indicator && call && createPortal(
        <Link className={`topbar-call topbar-call-${call}`} to={routes.phone}>
          <span className={`state-dot state-${call === 'connected' ? 'ok' : 'warn'}`} aria-hidden="true" />
          {call === 'incoming' ? `Incoming call from ${userOf(state.remoteIdentity)}` : `${describeCallState(call)} ${userOf(state.remoteIdentity)}`}
          {call === 'connected' && state.connectedAt !== undefined ? ` ${callTimer(Date.now() - state.connectedAt)}` : ''}
        </Link>,
        indicator,
      )}
    </>
  );
}
