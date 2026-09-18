import type { AdminApi } from '../api/AdminApi';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { Empty, ErrorMessage, Loading } from '../components/Status';

/**
 * How long a binding has left, and whether that is worth noticing.
 *
 * A registration close to expiry is ordinary — phones refresh at half the
 * interval — so this is amber rather than red, and only past zero is it a
 * problem. `now` is a parameter so the behaviour is testable without a clock.
 */
export function describeExpiry(expiresUnixMs: number, now: number): { label: string; tone: 'ok' | 'warn' | 'down' } {
  const remaining = Math.round((expiresUnixMs - now) / 1000);
  if (remaining <= 0) return { label: 'Expired', tone: 'down' };
  if (remaining < 60) return { label: `${remaining}s left`, tone: 'warn' };
  return { label: `${Math.round(remaining / 60)}m left`, tone: 'ok' };
}

export function RegistrationsScreen({ api }: { api: AdminApi }) {
  const result = useRefreshableAsync((signal) => api.listRegistrations(signal), [api]);
  const now = Date.now();

  return (
    <>
      <h1>Registrations</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Live contact bindings</h2>
            <p>
              Where this server currently believes each address-of-record can be reached.
              Bindings are created by phones registering, so there is nothing to edit here.
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={result.refresh} disabled={result.refreshing}>
            {result.refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {result.error && <ErrorMessage error={result.error} />}

        {result.loading ? <Loading /> : (result.value ?? []).length === 0 ? (
          <Empty>Nothing is registered. A phone that registers successfully will appear here.</Empty>
        ) : (
          <ul className="record-list">
            {(result.value ?? []).map((registration) => {
              const expiry = describeExpiry(registration.expires_unix_ms, now);
              return (
                <li className="record-row" key={registration.id}>
                  <div className="record-main" role="group" aria-label={registration.aor}>
                    <span className="record-name">
                      <span className={`state-dot state-${expiry.tone}`} aria-hidden="true" />
                      {registration.aor}
                    </span>
                    <span className="record-detail"><code>{registration.contact}</code></span>
                    <span className="record-detail">{registration.user_agent}</span>
                  </div>
                  <span className="record-tag">{registration.transport.toUpperCase()}</span>
                  <span className="record-tag">{registration.node_id}</span>
                  <span className={`record-tag state-tag-${expiry.tone}`}>{expiry.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
