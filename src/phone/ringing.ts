import { useEffect, useRef } from 'react';
import type { CallState } from '../softphone/Softphone';

export type Tone = 'ring' | 'ringback';

/**
 * Each tone as bursts of a pair of frequencies, in seconds: the British
 * double ring for a call arriving here, and the same cadence quieter for a
 * call ringing at the far end. Made with oscillators, so there is no sound
 * file in the bundle.
 */
const CADENCE: Record<Tone, { frequencies: [number, number]; gain: number; bursts: Array<[number, number]>; period: number }> = {
  ring: { frequencies: [400, 450], gain: 0.18, bursts: [[0, 0.4], [0.6, 1.0]], period: 3 },
  ringback: { frequencies: [400, 450], gain: 0.06, bursts: [[0, 0.4], [0.6, 1.0]], period: 3 },
};

/** The tone a call state wants, or none. */
export function toneFor(call: CallState): Tone | undefined {
  if (call === 'incoming') return 'ring';
  if (call === 'ringing') return 'ringback';
  return undefined;
}

/**
 * Plays one tone until stopped. A browser may hold an `AudioContext` until
 * the page has been clicked; the phone is registered by a click, so by the
 * time anything rings it has been.
 */
export function startTone(tone: Tone, create: () => AudioContext = () => new AudioContext()): () => void {
  let context: AudioContext;
  try {
    context = create();
  } catch {
    return () => undefined;
  }
  const { frequencies, gain: level, bursts, period } = CADENCE[tone];
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(context.destination);
  const oscillators = frequencies.map((frequency) => {
    const oscillator = context.createOscillator();
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start();
    return oscillator;
  });

  // Scheduled a minute ahead, period by period, and topped up as it runs out.
  let scheduledUntil = context.currentTime;
  const schedule = () => {
    while (scheduledUntil < context.currentTime + 60) {
      for (const [on, off] of bursts) {
        gain.gain.setValueAtTime(level, scheduledUntil + on);
        gain.gain.setValueAtTime(0, scheduledUntil + off);
      }
      scheduledUntil += period;
    }
  };
  schedule();
  const timer = setInterval(schedule, 30_000);
  void context.resume?.().catch(() => undefined);

  return () => {
    clearInterval(timer);
    for (const oscillator of oscillators) {
      try { oscillator.stop(); } catch { /* already stopped */ }
    }
    void context.close().catch(() => undefined);
  };
}

/** Rings while the call state asks for a tone, and stops the moment it does not. */
export function useRinging(call: CallState, create?: () => AudioContext): void {
  const tone = toneFor(call);
  const createRef = useRef(create);
  createRef.current = create;
  useEffect(() => {
    if (!tone || (typeof AudioContext === 'undefined' && !createRef.current)) return;
    return startTone(tone, createRef.current);
  }, [tone]);
}

/** Whether this browser can show a notification, and has been allowed to. */
export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/**
 * A notification for a call arriving while this tab is out of sight, closed
 * when the call stops ringing. Clicking it brings the console forward.
 */
export function useIncomingNotification(call: CallState, who: string): void {
  useEffect(() => {
    if (call !== 'incoming' || notificationPermission() !== 'granted' || !document.hidden) return;
    let shown: Notification | undefined;
    try {
      shown = new Notification('Incoming call', { body: who, tag: 'athenasip-incoming-call', requireInteraction: true });
      shown.onclick = () => { window.focus(); shown?.close(); };
    } catch {
      // Some browsers only notify from a service worker; the ring still sounds.
    }
    return () => shown?.close();
  }, [call, who]);
}
