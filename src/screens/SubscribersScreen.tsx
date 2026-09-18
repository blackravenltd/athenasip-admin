import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AdminApi } from '../api/AdminApi';
import type { Subscriber } from '../api/types';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { useSubmit } from '../hooks/useSubmit';
import { ConfirmModal, FormModal } from '../components/Modal';
import { Empty, ErrorMessage, Loading } from '../components/Status';

function NewSubscriberDialogue({ api, realm, open, onClose, onSaved }: {
  api: AdminApi;
  realm: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, clearError, run } = useSubmit();

  const close = () => {
    setUsername('');
    setDisplayName('');
    setPassword('');
    clearError();
    onClose();
  };

  const submit = () => {
    void run(() => api.createSubscriber(realm, {
      username,
      display_name: displayName,
      password,
      enabled: true,
    })).then((saved) => {
      if (!saved) return;
      onSaved();
      close();
    });
  };

  return (
    <FormModal
      open={open}
      title={`Add a subscriber to ${realm}`}
      submitLabel="Add subscriber"
      busy={busy}
      submitDisabled={!username.trim() || !password}
      error={error}
      onSubmit={submit}
      onCancel={close}
    >
      <label className="field">
        <span>Username</span>
        <input
          type="text"
          value={username}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Display name</span>
        <input
          type="text"
          value={displayName}
          disabled={busy}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          disabled={busy}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {/* Worth stating plainly, because the alternative assumption is the
          alarming one: this is the only moment the password exists as text. */}
      <p className="field-hint">
        The server derives the digest (HA1) and stores that. The password itself is not kept,
        and cannot be shown again.
      </p>
    </FormModal>
  );
}

function SubscriberRow({ api, realm, subscriber, onChanged }: {
  api: AdminApi;
  realm: string;
  subscriber: Subscriber;
  onChanged: () => void;
}) {
  const [dialogue, setDialogue] = useState<'password' | 'delete'>();
  const [password, setPassword] = useState('');
  const { busy, error, clearError, run } = useSubmit();
  const close = () => { setPassword(''); clearError(); setDialogue(undefined); };

  const act = (action: () => Promise<unknown>) => {
    void run(action).then((done) => {
      if (!done) return;
      onChanged();
      close();
    });
  };

  return (
    <li className="record-row">
      <div className="record-main" role="group" aria-label={subscriber.username}>
        <span className="record-name">
          <span className={`state-dot state-${subscriber.enabled ? 'ok' : 'warn'}`} aria-hidden="true" />
          {subscriber.username}@{subscriber.realm}
        </span>
        <span className="record-detail">{subscriber.display_name || 'No display name'}</span>
        {!subscriber.enabled && <span className="record-tag state-tag-warn">Disabled</span>}
      </div>
      <div className="record-actions">
        {/* Short visible labels, accessible names that say which account. */}
        <button
          className="secondary-button"
          type="button"
          aria-label={`${subscriber.enabled ? 'Disable' : 'Enable'} ${subscriber.username}`}
          onClick={() => act(() => api.updateSubscriber(realm, subscriber.id, { enabled: !subscriber.enabled }))}
          disabled={busy}
        >
          {subscriber.enabled ? 'Disable' : 'Enable'}
        </button>
        <button
          className="secondary-button"
          type="button"
          aria-label={`Set password for ${subscriber.username}`}
          onClick={() => setDialogue('password')}
        >
          Set password
        </button>
        <button
          className="secondary-button danger-button"
          type="button"
          aria-label={`Delete ${subscriber.username}`}
          onClick={() => setDialogue('delete')}
        >
          Delete
        </button>
      </div>

      <FormModal
        open={dialogue === 'password'}
        title={`Set a password for ${subscriber.username}`}
        submitLabel="Change password"
        busy={busy}
        submitDisabled={!password}
        error={error}
        onSubmit={() => act(() => api.updateSubscriber(realm, subscriber.id, { password }))}
        onCancel={close}
      >
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            value={password}
            disabled={busy}
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <p className="field-hint">Any phone registered as {subscriber.username} will have to re-register.</p>
      </FormModal>

      <ConfirmModal
        open={dialogue === 'delete'}
        title={`Delete ${subscriber.username}?`}
        confirmLabel="Delete subscriber"
        destructive
        busy={busy}
        onCancel={close}
        onConfirm={() => act(() => api.deleteSubscriber(realm, subscriber.id))}
      >
        <p>
          <strong>{subscriber.username}@{subscriber.realm}</strong> will be removed and any
          registration it holds will stop being answered for. This cannot be undone.
        </p>
        {error && <p className="error-message" role="alert">{error}</p>}
      </ConfirmModal>
    </li>
  );
}

/**
 * The accounts of one realm.
 *
 * The realm is a query parameter rather than a path segment because this
 * screen is reached two ways — from a realm's row, and from the section bar
 * with nothing chosen — and a path parameter has no way to express the second.
 * With nothing chosen it asks, rather than guessing at the first realm and
 * showing somebody a list they did not ask for.
 */
export function SubscribersScreen({ api }: { api: AdminApi }) {
  const [params, setParams] = useSearchParams();
  const realm = params.get('realm') ?? '';

  const realms = useRefreshableAsync((signal) => api.listRealms(signal), [api]);
  const result = useRefreshableAsync(
    (signal) => (realm ? api.listSubscribers(realm, signal) : Promise.resolve([])),
    [api, realm],
  );
  const refresh = result.refresh;
  const onChanged = useCallback(() => refresh(), [refresh]);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <h1>Subscribers</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Accounts</h2>
            <p>
              A subscriber is one account in one realm. Its password is only ever sent here;
              the server keeps the digest and authenticates against that.
            </p>
          </div>
          {realm && (
            <button className="secondary-button" type="button" onClick={result.refresh} disabled={result.refreshing}>
              {result.refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          )}
        </div>

        <label className="field" style={{ maxWidth: '22rem' }}>
          <span>Realm</span>
          <select
            value={realm}
            onChange={(event) => setParams(event.target.value ? { realm: event.target.value } : {})}
          >
            <option value="">Choose a realm</option>
            {(realms.value ?? []).map((candidate) => (
              <option key={candidate.id} value={candidate.name}>{candidate.name}</option>
            ))}
          </select>
        </label>

        {realms.error && <ErrorMessage error={realms.error} />}
        {result.error && <ErrorMessage error={result.error} />}

        {!realm ? (
          <Empty>Choose a realm to see its subscribers.</Empty>
        ) : result.loading ? (
          <Loading />
        ) : (
          <>
            <div className="panel-actions">
              <button className="primary-button" type="button" onClick={() => setAdding(true)}>Add a subscriber</button>
            </div>
            {adding && (
              <NewSubscriberDialogue
                api={api}
                realm={realm}
                open
                onClose={() => setAdding(false)}
                onSaved={onChanged}
              />
            )}
            {(result.value ?? []).length === 0 ? (
              <Empty>{realm} has no subscribers yet.</Empty>
            ) : (
              <ul className="record-list">
                {(result.value ?? []).map((subscriber) => (
                  <SubscriberRow
                    key={subscriber.id}
                    api={api}
                    realm={realm}
                    subscriber={subscriber}
                    onChanged={onChanged}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </>
  );
}
