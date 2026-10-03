import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/roboto/wght.css';
import App from './App';
import { FakeAdminApi } from './api/FakeAdminApi';
import { HttpAdminApi } from './api/HttpAdminApi';
import type { AdminApi } from './api/AdminApi';
import type { ApiError } from './api/errors';
import { Session } from './auth/Session';
import './styles.css';

const session = new Session();

/** A 401 from any request ends the session, whichever screen made it. */
const onUnauthorized = (error: ApiError) => session.signOut(`Signed out: ${error.message}.`);

/**
 * A 403 means a role may have been taken away since sign-in: the node
 * re-checks every request. Re-read what this session may do, once at a time,
 * so the navigation stops offering what it can no longer use.
 */
let refreshing = false;
const onForbidden = () => {
  if (refreshing || !session.token) return;
  refreshing = true;
  void api.session()
    .then((info) => session.update(info))
    .catch(() => undefined)
    .finally(() => { refreshing = false; });
};

/**
 * Which node this client talks to.
 *
 * `VITE_ATHENASIP_LIVE=true` is the real thing: same-origin `/api/v1`, which a
 * production build gets from the node that serves it and the dev server gets
 * by proxy. Anything else is the in-memory node, which enforces the same
 * rules, users, roles and tokens included, so signing in and every role are
 * exercised in development too. The delay is deliberate: a loading state
 * nobody ever sees in development is a loading state nobody notices is broken.
 */
function selectApi(): { api: AdminApi; hint?: string } {
  if (import.meta.env.VITE_ATHENASIP_LIVE === 'true') {
    return { api: new HttpAdminApi({ token: () => session.token, onUnauthorized, onForbidden }) };
  }
  return {
    api: new FakeAdminApi({
      latencyMs: 220,
      secured: true,
      token: () => session.token,
      onUnauthorized,
      onForbidden,
    }),
    hint: 'This is the in-memory development node. Each password is the username: admin has every role, ops views status, helpdesk manages subscribers, newhire has none.',
  };
}

const { api, hint } = selectApi();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

ReactDOM.createRoot(rootElement).render(
  <BrowserRouter>
    <App api={api} session={session} loginHint={hint} />
  </BrowserRouter>,
);
