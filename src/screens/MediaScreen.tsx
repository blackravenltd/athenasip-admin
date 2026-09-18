import { Link } from 'react-router-dom';
import type { AdminApi } from '../api/AdminApi';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { ErrorMessage, Loading } from '../components/Status';
import { routes } from '../app/routes';

export function MediaScreen({ api }: { api: AdminApi }) {
  const result = useRefreshableAsync((signal) => api.status(signal), [api]);

  return (
    <>
      <h1>Media</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Media engine</h2>
            <p>
              The engine this node relays RTP through. <code>builtin://</code> needs nothing
              installed and handles plain RTP in this process; <code>rtpengine://</code> is the
              production engine and the one that does WebRTC.
            </p>
          </div>
        </div>

        {result.error && <ErrorMessage error={result.error} />}
        {result.loading ? <Loading /> : result.value && (
          <dl className="readout">
            <dt>Engine</dt><dd><code>{result.value.media_url}</code></dd>
            <dt>Active calls</dt><dd>{result.value.active_call_count}</dd>
          </dl>
        )}

        <div className="panel-actions">
          <Link className="secondary-button" to={routes.rtpRelay}>RTP relay settings</Link>
        </div>
      </section>
    </>
  );
}
