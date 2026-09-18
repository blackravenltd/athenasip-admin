import { useEffect, useState } from 'react';
import type { AdminApi } from '../api/AdminApi';
import type { RtpRelaySettings } from '../api/types';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { useSubmit } from '../hooks/useSubmit';
import { ErrorMessage, Loading } from '../components/Status';

/**
 * How many simultaneous calls a port range allows.
 *
 * Two ports per call — RTP on an even port, RTCP on the odd one above it — so
 * the number an operator actually wants is not the one they typed. Stating it
 * is the difference between a range that is obviously too small and one that
 * only reveals itself under load.
 */
export function concurrentCalls(portMin: number, portMax: number): number {
  const ports = portMax - portMin + 1;
  return ports > 0 ? Math.floor(ports / 2) : 0;
}

export function RtpRelayScreen({ api }: { api: AdminApi }) {
  const result = useRefreshableAsync((signal) => api.rtpRelaySettings(signal), [api]);
  const { busy, error, run } = useSubmit();
  const [draft, setDraft] = useState<RtpRelaySettings>();
  const [saved, setSaved] = useState(false);

  // The form edits a copy. Until it is loaded there is nothing to edit, and
  // seeding it with invented defaults would show somebody a port range that is
  // not the one the server is using.
  useEffect(() => {
    if (result.value) setDraft(result.value);
  }, [result.value]);

  const change = <K extends keyof RtpRelaySettings>(key: K, value: RtpRelaySettings[K]) => {
    setSaved(false);
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const submit = () => {
    if (!draft) return;
    void run(() => api.saveRtpRelaySettings(draft)).then((ok) => {
      if (!ok) return;
      setSaved(true);
      result.refresh();
    });
  };

  return (
    <>
      <h1>RTP Relay</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Builtin relay</h2>
            <p>
              The relay carries media between two endpoints that cannot reach each other
              directly. It runs inside this process and needs nothing installed.
            </p>
          </div>
        </div>

        {result.error && <ErrorMessage error={result.error} />}
        {result.loading && !draft ? <Loading /> : draft && (
          <form
            className="settings-form"
            onSubmit={(event) => { event.preventDefault(); submit(); }}
          >
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.enabled}
                disabled={busy}
                onChange={(event) => change('enabled', event.target.checked)}
              />
              <span>Enable the RTP relay</span>
            </label>

            <fieldset>
              <legend>Port range</legend>
              <div className="field-row">
                <label className="field">
                  <span>From</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.port_min}
                    disabled={busy || !draft.enabled}
                    onChange={(event) => change('port_min', Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>To</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.port_max}
                    disabled={busy || !draft.enabled}
                    onChange={(event) => change('port_max', Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Public address</span>
                  <input
                    type="text"
                    value={draft.public_address}
                    disabled={busy || !draft.enabled}
                    spellCheck={false}
                    onChange={(event) => change('public_address', event.target.value)}
                  />
                </label>
              </div>
              <p className="field-hint">
                Room for about {concurrentCalls(draft.port_min, draft.port_max)} simultaneous calls:
                each one takes two ports, RTP and RTCP.
              </p>
            </fieldset>

            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.queue_until_both_connected}
                disabled={busy || !draft.enabled}
                onChange={(event) => change('queue_until_both_connected', event.target.checked)}
              />
              <span>Queue packets until both sides connect</span>
            </label>
            <p className="field-hint">
              The relay has to hear from both endpoints before it knows where to send anything.
              With this on, packets that arrive from one side first are held and forwarded once
              the other is heard from, rather than dropped.
            </p>

            {error && <p className="error-message" role="alert">{error}</p>}
            {saved && !error && <p className="field-hint" role="status">Saved.</p>}

            <div className="button-row">
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? 'Saving...' : 'Save settings'}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => { setSaved(false); setDraft(result.value); }}
              >
                Discard changes
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
