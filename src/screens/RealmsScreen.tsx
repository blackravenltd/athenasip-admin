import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminApi } from '../api/AdminApi';
import type { Realm } from '../api/types';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { usePagination } from '../hooks/usePagination';
import { useSubmit } from '../hooks/useSubmit';
import { ConfirmModal, FormModal } from '../components/Modal';
import { Empty, ErrorMessage, Loading } from '../components/Status';
import { realmSubscribers } from '../app/routes';

const PAGE_SIZE = 10;

function RealmDialogue({ api, realm, open, onClose, onSaved }: {
  api: AdminApi;
  /** Absent when creating. The dialogue is the same either way; only the verb differs. */
  realm?: Realm;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(realm?.name ?? '');
  const [description, setDescription] = useState(realm?.description ?? '');
  const { busy, error, clearError, run } = useSubmit();

  const close = () => { clearError(); onClose(); };

  const submit = () => {
    void run(() => (realm
      ? api.updateRealm(realm.id, { name, description })
      : api.createRealm({ name, description }))).then((saved) => {
      if (!saved) return;
      onSaved();
      close();
    });
  };

  return (
    <FormModal
      open={open}
      title={realm ? `Edit ${realm.name}` : 'Add a realm'}
      submitLabel={realm ? 'Save realm' : 'Add realm'}
      busy={busy}
      submitDisabled={!name.trim()}
      error={error}
      onSubmit={submit}
      onCancel={close}
    >
      <label className="field">
        <span>Domain</span>
        <input
          type="text"
          value={name}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          placeholder="sip.example.org"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Description</span>
        <input
          type="text"
          value={description}
          disabled={busy}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
    </FormModal>
  );
}

function RealmRow({ api, realm, onChanged }: { api: AdminApi; realm: Realm; onChanged: () => void }) {
  const [dialogue, setDialogue] = useState<'edit' | 'delete'>();
  const { busy, error, clearError, run } = useSubmit();
  const close = () => { clearError(); setDialogue(undefined); };

  const remove = () => {
    void run(() => api.deleteRealm(realm.id)).then((removed) => {
      if (!removed) return;
      onChanged();
      close();
    });
  };

  return (
    <li className="record-row">
      <div className="record-main" role="group" aria-label={realm.name}>
        <span className="record-name">{realm.name}</span>
        <span className="record-detail">{realm.description || 'No description'}</span>
        <span className="record-tag">{realm.subscriber_count} subscriber{realm.subscriber_count === 1 ? '' : 's'}</span>
      </div>
      <div className="record-actions">
        <Link className="secondary-button" to={realmSubscribers(realm.name)}>Subscribers</Link>
        {/* The visible label is short; the accessible name names the record,
            because "Edit" repeated down a list tells a screen reader nothing
            about which realm it would edit. */}
        <button
          className="secondary-button"
          type="button"
          aria-label={`Edit ${realm.name}`}
          onClick={() => setDialogue('edit')}
        >
          Edit
        </button>
        <button
          className="secondary-button danger-button"
          type="button"
          aria-label={`Delete ${realm.name}`}
          onClick={() => setDialogue('delete')}
        >
          Delete
        </button>
      </div>

      {dialogue === 'edit' && (
        <RealmDialogue api={api} realm={realm} open onClose={close} onSaved={onChanged} />
      )}
      <ConfirmModal
        open={dialogue === 'delete'}
        title={`Delete ${realm.name}?`}
        confirmLabel="Delete realm"
        destructive
        busy={busy}
        onCancel={close}
        onConfirm={remove}
      >
        <p>
          <strong>{realm.name}</strong> and its routing will be removed. Any phone registered
          against it will fail to re-register. This cannot be undone.
        </p>
        {error && <p className="error-message" role="alert">{error}</p>}
      </ConfirmModal>
    </li>
  );
}

export function RealmsScreen({ api }: { api: AdminApi }) {
  const result = useRefreshableAsync((signal) => api.listRealms(signal), [api]);
  const refresh = result.refresh;
  const onChanged = useCallback(() => refresh(), [refresh]);
  const [adding, setAdding] = useState(false);
  const realms = result.value ?? [];
  const { page, pageIndex, pageCount, next, previous } = usePagination(realms, PAGE_SIZE);

  return (
    <>
      <h1>Realms</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>SIP domains</h2>
            <p>
              A realm is a SIP domain this server is responsible for. In the identity below,
              the realm is the domain part.
            </p>
            <code className="example">&quot;John Smith&quot; &lt;sip:john.smith@sip.athenasip.org&gt;</code>
            <p>
              Subscribers belong to exactly one realm, and authentication is scoped to it:
              the same username in two realms is two different accounts.
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={result.refresh} disabled={result.refreshing}>
            {result.refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {result.error && <ErrorMessage error={result.error} />}

        {!result.value ? (
          result.loading ? <Loading /> : !result.error && (
            <p className="error-message" role="alert">The server did not return a realm list.</p>
          )
        ) : (
          <>
            <div className="panel-actions">
              <button className="primary-button" type="button" onClick={() => setAdding(true)}>Add a realm</button>
            </div>
            {adding && (
              <RealmDialogue api={api} open onClose={() => setAdding(false)} onSaved={onChanged} />
            )}

            {realms.length === 0 ? (
              <Empty>No realms yet. Add one, and this server will start answering for that domain.</Empty>
            ) : (
              <>
                <ul className="record-list">
                  {page.map((realm) => (
                    <RealmRow key={realm.id} api={api} realm={realm} onChanged={onChanged} />
                  ))}
                </ul>
                {pageCount > 1 && (
                  <div className="pagination">
                    <button className="secondary-button" type="button" onClick={previous} disabled={pageIndex === 0}>
                      Previous
                    </button>
                    <span>Page {pageIndex + 1} of {pageCount}</span>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={next}
                      disabled={pageIndex === pageCount - 1}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
