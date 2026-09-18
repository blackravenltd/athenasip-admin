import { Link } from 'react-router-dom';
import type { AdminApi } from '../api/AdminApi';
import type { TransportStatus } from '../api/types';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { ErrorMessage, Loading } from '../components/Status';
import { routes } from '../app/routes';

/**
 * How long the server has been up, in words rather than in seconds.
 *
 * Seconds are precise and unreadable: "4523" is the kind of number an operator
 * has to do arithmetic on before it means anything.
 */
export function describeUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'unknown';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(seconds)}s`;
}

/**
 * A transport's state, as one of three words.
 *
 * `listening` absent means the server did not say, which is not the same as
 * down — an older node that does not report it must not be drawn as broken.
 */
export function transportState(transport: TransportStatus): { label: string; tone: 'ok' | 'warn' | 'down' } {
  if (!transport.enabled) return { label: 'Disabled', tone: 'warn' };
  if (transport.listening === false) return { label: 'Not listening', tone: 'down' };
  return { label: 'Listening', tone: 'ok' };
}

export function OverviewScreen({ api }: { api: AdminApi }) {
  const result = useRefreshableAsync((signal) => api.status(signal), [api]);

  return (
    <>
      <h1>Overview</h1>

      {!result.value ? (
        <section className="panel">
          {result.loading ? <Loading /> : result.error ? <ErrorMessage error={result.error} /> : (
            <p className="error-message" role="alert">The server did not return a status.</p>
          )}
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>This node</h2>
                <p>What this AthenaSIP process is, and what it is currently carrying.</p>
              </div>
              <button className="secondary-button" type="button" onClick={result.refresh} disabled={result.refreshing}>
                {result.refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            {result.error && <ErrorMessage error={result.error} />}
            <dl className="readout">
              <dt>Node</dt><dd>{result.value.node_id}</dd>
              <dt>Version</dt><dd>{result.value.version}</dd>
              <dt>Uptime</dt><dd>{describeUptime(result.value.uptime_seconds)}</dd>
              <dt>Registrations</dt>
              <dd><Link to={routes.registrations}>{result.value.registration_count}</Link></dd>
              <dt>Active calls</dt><dd>{result.value.active_call_count}</dd>
              <dt>Datastore</dt><dd><code>{result.value.datastore_url}</code></dd>
              <dt>Events</dt><dd><code>{result.value.events_url}</code></dd>
              <dt>Media</dt><dd><code>{result.value.media_url}</code></dd>
            </dl>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Transports</h2>
                <p>
                  The listeners this node has opened. AthenaSIP is TLS-first: plain UDP and TCP
                  are here because they have been explicitly enabled, not by default.
                </p>
              </div>
            </div>
            <ul className="record-list">
              {result.value.transports.map((transport) => {
                const state = transportState(transport);
                return (
                  <li className="record-row" key={transport.transport}>
                    <div className="record-main" role="group" aria-label={transport.transport.toUpperCase()}>
                      <span className="record-name">
                        <span className={`state-dot state-${state.tone}`} aria-hidden="true" />
                        {transport.transport.toUpperCase()}
                      </span>
                      <span className="record-detail">{transport.address}:{transport.port}</span>
                    </div>
                    <span className={`record-tag state-tag-${state.tone}`}>{state.label}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
