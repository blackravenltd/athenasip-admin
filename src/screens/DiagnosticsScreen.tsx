import { Link } from 'react-router-dom';
import { routes } from '../app/routes';

/**
 * Tools for proving the server works, as distinct from configuring it.
 *
 * The softphone lives here rather than under SIP because it is not
 * provisioning: it is a WebRTC endpoint that registers against this server and
 * places a call, to demonstrate that the WebSocket transport and the RTP relay
 * carry one. Putting it in the provisioning navigation made the console look
 * like a phone.
 */
export function DiagnosticsScreen() {
  return (
    <>
      <h1>Diagnostics</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Tools</h2>
            <p>Ways to exercise this server from the browser, rather than to configure it.</p>
          </div>
        </div>
        <div className="panel-actions">
          <Link className="secondary-button" to={routes.softphone}>WebRTC softphone</Link>
        </div>
      </section>
    </>
  );
}
