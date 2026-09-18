import type { AdminApi } from '../api/AdminApi';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { ErrorMessage, Loading } from '../components/Status';
import { transportState } from './OverviewScreen';

/**
 * Whether this node is actually as secure as it is meant to be.
 *
 * AthenaSIP's first stated principle is TLS-only SIP with SRTP and DTLS-SRTP
 * enforced, and plaintext explicitly opted into. So the useful question this
 * screen answers is not "is TLS configured" but "is anything unencrypted
 * currently listening" — which is a thing the transport list already knows and
 * nothing else in the interface points out.
 */
export function SecurityScreen({ api }: { api: AdminApi }) {
  const result = useRefreshableAsync((signal) => api.status(signal), [api]);
  const plaintext = (result.value?.transports ?? []).filter(
    (transport) => transport.enabled && (transport.transport === 'udp' || transport.transport === 'tcp' || transport.transport === 'ws'),
  );

  return (
    <>
      <h1>Security</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Transport encryption</h2>
            <p>
              AthenaSIP is TLS-first: unencrypted SIP has to be turned on deliberately.
              Anything listed here is carrying signalling in the clear.
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={result.refresh} disabled={result.refreshing}>
            {result.refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {result.error && <ErrorMessage error={result.error} />}
        {result.loading ? <Loading /> : result.value && (
          plaintext.length === 0 ? (
            <p className="field-hint" role="status">
              <span className="state-dot state-ok" aria-hidden="true" /> No unencrypted transport is enabled.
            </p>
          ) : (
            <ul className="record-list">
              {plaintext.map((transport) => (
                <li className="record-row" key={transport.transport}>
                  <div className="record-main" role="group" aria-label={transport.transport.toUpperCase()}>
                    <span className="record-name">
                      <span className="state-dot state-warn" aria-hidden="true" />
                      {transport.transport.toUpperCase()}
                    </span>
                    <span className="record-detail">{transport.address}:{transport.port}</span>
                  </div>
                  <span className="record-tag state-tag-warn">Unencrypted</span>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </>
  );
}

export function TlsScreen({ api }: { api: AdminApi }) {
  const result = useRefreshableAsync((signal) => api.status(signal), [api]);
  const tls = (result.value?.transports ?? []).find((transport) => transport.transport === 'tls');

  return (
    <>
      <h1>TLS</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>TLS listener</h2>
            <p>
              The certificate and cipher policy are read from the server's configuration.
              Editing them from here needs the settings endpoints, which the server does not
              expose yet.
            </p>
          </div>
        </div>

        {result.error && <ErrorMessage error={result.error} />}
        {result.loading ? <Loading /> : !tls ? (
          <p className="field-hint">This node does not report a TLS transport.</p>
        ) : (
          <dl className="readout">
            <dt>State</dt>
            <dd>
              <span className={`state-dot state-${transportState(tls).tone}`} aria-hidden="true" />{' '}
              {transportState(tls).label}
            </dd>
            <dt>Address</dt><dd>{tls.address}:{tls.port}</dd>
          </dl>
        )}
      </section>
    </>
  );
}
