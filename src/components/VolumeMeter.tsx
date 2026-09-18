import { useEffect, useRef } from 'react';

export type MeterSource =
  | { kind: 'element'; element: HTMLMediaElement | null }
  | { kind: 'microphone' };

/**
 * A level bar driven by the Web Audio analyser, for one audio source.
 *
 * One component for both directions, because the only difference between
 * watching the far end and watching the microphone is which node the analyser
 * is connected to, and two near-identical copies of this drifted apart within
 * a week of being written.
 *
 * The animation frame is held and cancelled. The earlier pair of components
 * started a `requestAnimationFrame` loop and never stopped it, so every visit
 * to the page left another one running against a closed `AudioContext`.
 */
export function VolumeMeter({ label, source, active }: { label: string; source: MeterSource; active: boolean }) {
  const levelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    if (source.kind === 'element' && !source.element) return;

    let cancelled = false;
    let frame = 0;
    let context: AudioContext | undefined;
    let stream: MediaStream | undefined;
    let node: AudioNode | undefined;

    const start = async () => {
      try {
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        const data = new Uint8Array(analyser.frequencyBinCount);

        if (source.kind === 'microphone') {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (cancelled) return;
          node = context.createMediaStreamSource(stream);
          node.connect(analyser);
        } else {
          node = context.createMediaElementSource(source.element as HTMLMediaElement);
          node.connect(analyser);
          // Only the far end is routed on to the speakers. Doing this for the
          // microphone would put the operator's own voice in their ears.
          analyser.connect(context.destination);
        }

        const tick = () => {
          analyser.getByteFrequencyData(data);
          const average = data.reduce((total, value) => total + value, 0) / data.length;
          const percent = Math.min(100, Math.round((average / 256) * 100));
          if (levelRef.current) levelRef.current.style.width = `${percent}%`;
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (cause) {
        // A refused microphone, or an element already attached to another
        // context. Neither is worth an error banner on a diagnostics page.
        console.warn('Volume meter could not start', cause);
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      node?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
    };
  }, [active, source]);

  return (
    <div className="meter-label">
      <span>{label}</span>
      <div className="meter-bar">
        <div className="meter-level" ref={levelRef} />
      </div>
    </div>
  );
}
