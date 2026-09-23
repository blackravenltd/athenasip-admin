import ReactDOM from 'react-dom/client';
import '@fontsource-variable/roboto/wght.css';
import { SoftphoneScreen } from '../screens/SoftphoneScreen';
import { pageOptions, withoutPassword } from './page';
import '../styles.css';

/**
 * The softphone on a page of its own.
 *
 * This is the browser end of AthenaSIP's end-to-end run: a static file the
 * node serves from its own listener, which needs no router and no history
 * fallback, opened with a query string that says which node to register
 * against and what to do. It is the same component the console shows under
 * Diagnostics, without the console around it.
 */
const options = pageOptions(window.location.search);

// The password was read; it has no business staying in the address bar.
const cleaned = withoutPassword(window.location.href);
if (cleaned) window.history.replaceState(window.history.state, '', cleaned);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

ReactDOM.createRoot(rootElement).render(
  <div className="app-shell softphone-page">
    <main>
      <div className="admin-screen">
        <SoftphoneScreen options={options} />
      </div>
    </main>
  </div>,
);
