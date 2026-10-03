import { useEffect, useRef } from 'react';

export type MeterSource =
  | { kind: 'stream'; stream?: MediaStream }
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
 *
 * The far end is read from its stream, never from the `<audio>` element
 * playing it. An element can be given to `createMediaElementSource` once in
 * its life, so the meter went dead the first time it restarted, while the
 * element went on playing. And the effect restarts only when the stream or
 * the kind changes, not when the caller hands over a new object for the same
 * source, which the softphone does on every render, once a second.
 */
export function VolumeMeter({ label, source, active }: { label: string; source: MeterSource; active: boolean }) {
  const levelRef = useRef<HTMLDivElement>(null);

  const kind = source.kind;
  const stream = source.kind === 'stream' ? source.stream : undefined;

  useEffect(() => {
    if (!active) return;
    if (kind === 'stream' && !stream) return;

    let cancelled = false;
    let frame = 0;
    let context: AudioContext | undefined;
    let microphone: MediaStream | undefined;
    let node: AudioNode | undefined;

    const start = async () => {
      try {
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        const data = new Uint8Array(analyser.frequencyBinCount);

        if (kind === 'microphone') {
          microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (cancelled) return;
          node = context.createMediaStreamSource(microphone);
        } else {
          // Not routed on to the speakers: the <audio> element plays it.
          node = context.createMediaStreamSource(stream as MediaStream);
        }
        node.connect(analyser);

        const tick = () => {
          analyser.getByteFrequencyData(data);
          const average = data.reduce((total, value) => total + value, 0) / data.length;
          const percent = Math.min(100, Math.round((average / 256) * 100));
          if (levelRef.current) levelRef.current.style.width = `${percent}%`;
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (cause) {
        // A refused microphone, or no audio context to be had. Neither is
        // worth an error banner on a diagnostics page.
        console.warn('Volume meter could not start', cause);
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      node?.disconnect();
      microphone?.getTracks().forEach((track) => track.stop());
      void context?.close();
    };
  }, [active, kind, stream]);

  return (
    <div className="meter-label">
      <span>{label}</span>
      <div className="meter-bar">
        <div className="meter-level" ref={levelRef} />
      </div>
    </div>
  );
}
