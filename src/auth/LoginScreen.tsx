import { useState } from 'react';
import type { AdminApi } from '../api/AdminApi';
import { ApiError, errorMessage, isAbort } from '../api/errors';
import type { Session } from './Session';

/** What to say about a refused sign-in. */
export function describeRefusal(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.isUnauthorized) {
      // One answer for a wrong name, a wrong password and a disabled user, as the node gives.
      return 'That username and password were not accepted.';
    }
    if (cause.status === 404) {
      return 'This node predates user logins, and this console cannot sign in to it. Update the node.';
    }
    if (cause.status === 503) {
      return 'The node cannot reach its datastore, so it cannot check a password right now. Try again shortly.';
    }
    if (cause.status === 429) {
      return cause.retryAfter
        ? `Too many attempts. Try again in ${cause.retryAfter} second${cause.retryAfter === 1 ? '' : 's'}.`
        : 'Too many attempts. Wait a little and try again.';
    }
  }
  return errorMessage(cause);
}

/**
 * Signs in with a username and password. The first user is created with
 * `athenasip --add-user` on the node's host, and a lost password is reset with
 * `athenasip --reset-password` there.
 *
 * `ended` says why the last session ended, if it ended on its own.
 */
export function LoginScreen({ api, session, ended, hint }: {
  api: AdminApi;
  session: Session;
  ended?: string;
  /** Development only: who the in-memory node lets in. */
  hint?: string;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const ready = Boolean(username.trim() && password);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.login(username.trim(), password);
      const info = await api.session(result.token);
      setPassword('');
      session.signIn(result.token, info, info.expires_at ?? result.expires_at);
    } catch (cause) {
      if (!isAbort(cause)) setError(describeRefusal(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel login-panel">
      <div className="panel-heading">
        <div>
          <h1>Sign in</h1>
          <p>Sign in as a user of this node. What you can do here depends on the roles your user has been given.</p>
        </div>
      </div>

      {ended && <p className="error-message" role="alert">{ended}</p>}

      <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label className="field">
          <span>Username</span>
          <input
            type="text"
            value={username}
            disabled={busy}
            autoComplete="username"
            spellCheck={false}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            disabled={busy}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <p className="field-hint">
          Nothing here is stored. The session lives in this page only, and a reload asks again.
          No user yet? Run <code>athenasip --add-user NAME</code> on the node&apos;s host. Lost your
          password? Run <code>athenasip --reset-password NAME</code> there.
          {hint && <> {hint}</>}
        </p>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="button-row">
          <button className="primary-button" type="submit" disabled={busy || !ready}>
            {busy ? 'Checking...' : 'Sign in'}
          </button>
        </div>
      </form>
    </section>
  );
}
