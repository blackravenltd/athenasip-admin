import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/roboto/wght.css';
import App from './App';
import { FakeAdminApi } from './api/FakeAdminApi';
import { HttpAdminApi } from './api/HttpAdminApi';
import type { AdminApi } from './api/AdminApi';
import './styles.css';

/**
 * Which server this client talks to.
 *
 * Until AthenaSIP answers `/api/v1`, the default is the in-memory fake: a
 * console that renders an error on every panel teaches nobody anything about
 * the design, and the fake enforces the same rules the server will. Set
 * `VITE_ATHENASIP_LIVE=true` to point at the real thing instead — the dev
 * server proxies `/api` to it, and a production build is served by the SIP
 * server itself, so the base URL stays empty and same-origin in both.
 *
 * The delay is deliberate: a loading state nobody ever sees in development is
 * a loading state nobody notices is broken.
 */
function selectApi(): AdminApi {
  if (import.meta.env.VITE_ATHENASIP_LIVE === 'true') return new HttpAdminApi();
  return new FakeAdminApi(220);
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

ReactDOM.createRoot(rootElement).render(
  <BrowserRouter>
    <App api={selectApi()} />
  </BrowserRouter>,
);
