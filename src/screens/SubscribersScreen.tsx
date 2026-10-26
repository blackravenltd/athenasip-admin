import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AdminApi } from '../api/AdminApi';
import { isConflict } from '../api/errors';
import type { DtmfMode, Subscriber, MediaProfile } from '../api/types';
import { DTMF_TEXT, MEDIA_PROFILE_TEXT } from '../realms/policy';
import { DtmfField, SubscriberMediaField } from '../realms/PolicyFields';
import { AttributesField, attributesText, parseAttributes } from '../components/AttributesField';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { useSubmit } from '../hooks/useSubmit';
import { ConfirmModal, FormModal } from '../components/Modal';
import { Empty, ErrorMessage, Loading } from '../components/Status';

function NewSubscriberDialogue({ api, realm, realmProfile, onClose, onSaved }: {
  api: AdminApi;
  realm: string;
  realmProfile?: MediaProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState<MediaProfile | null>(null);
  const { busy, error, failure, clearError, run } = useSubmit();
  const taken = isConflict(failure);

  const submit = () => {
    void run(() => api.createSubscriber(realm, { user: user.trim(), password, behaviour: { media_profile: profile } })).then((saved) => {
      if (!saved) return;
      onSaved();
      onClose();
    });
  };

  return (
    <FormModal
      open
      title={`Add a subscriber to ${realm}`}
      submitLabel="Add subscriber"
      busy={busy}
      submitDisabled={!user.trim() || !password}
      error={taken ? undefined : error}
      onSubmit={submit}
      onCancel={() => { clearError(); onClose(); }}
    >
      <label className="field">
        <span>User</span>
        <input
          type="text"
          value={user}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={taken || undefined}
          onChange={(event) => { setUser(event.target.value); if (taken) clearError(); }}
        />
        {taken && <span className="field-error" role="alert">{user.trim()}@{realm} already exists.</span>}
      </label>
      <p className="field-hint">
        The part before the @. The subscriber&apos;s address is{' '}
        <code>sip:{user.trim() || 'user'}@{realm}</code>.
      </p>
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
      <p className="field-hint">
        The node derives the digest (HA1) from it and keeps only that. The password itself is not
        stored and cannot be shown again.
      </p>
      <SubscriberMediaField value={profile} realmProfile={realmProfile} busy={busy} onChange={setProfile} />
    </FormModal>
  );
}

function SubscriberRow({ api, subscriber, realmProfile, realmDtmf, onChanged }: {
  api: AdminApi;
  subscriber: Subscriber;
  realmProfile?: MediaProfile;
  /** The realm's effective key presses; absent from a node without the setting, which is then never sent. */
  realmDtmf?: DtmfMode;
  onChanged: () => void;
}) {
  const [dialogue, setDialogue] = useState<'password' | 'media' | 'attributes' | 'delete'>();
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState(subscriber.behaviour.media_profile);
  const [dtmf, setDtmf] = useState(subscriber.behaviour.dtmf ?? null);
  const [attributes, setAttributes] = useState(attributesText(subscriber.attributes));
  const parsedAttributes = parseAttributes(attributes);
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
      <div className="record-main" role="group" aria-label={subscriber.user}>
        <span className="record-name">{subscriber.user}</span>
        <span className="record-detail"><code>{subscriber.uri}</code></span>
      </div>
      {/* Only the subscriber's own setting: the realm's is on the realm. */}
      {subscriber.behaviour.media_profile && <span className="record-tag">{MEDIA_PROFILE_TEXT[subscriber.behaviour.media_profile].label}</span>}
      {subscriber.behaviour.dtmf && <span className="record-tag">Keys: {DTMF_TEXT[subscriber.behaviour.dtmf].label}</span>}
      <div className="record-actions">
        <button
          className="secondary-button"
          type="button"
          aria-label={`Set password for ${subscriber.user}`}
          onClick={() => setDialogue('password')}
        >
          Set password
        </button>
        <button
          className="secondary-button"
          type="button"
          aria-label={`Media for ${subscriber.user}`}
          // Reset from the subscriber, which a refresh may have changed.
          onClick={() => { setProfile(subscriber.behaviour.media_profile); setDtmf(subscriber.behaviour.dtmf ?? null); setDialogue('media'); }}
        >
          Media
        </button>
        {subscriber.attributes !== undefined && (
          <button
            className="secondary-button"
            type="button"
            aria-label={`Attributes for ${subscriber.user}`}
            onClick={() => { setAttributes(attributesText(subscriber.attributes)); setDialogue('attributes'); }}
          >
            Attributes
          </button>
        )}
        <button
          className="secondary-button danger-button"
          type="button"
          aria-label={`Delete ${subscriber.user}`}
          onClick={() => setDialogue('delete')}
        >
          Delete
        </button>
      </div>

      <FormModal
        open={dialogue === 'password'}
        title={`Set a password for ${subscriber.user}`}
        submitLabel="Change password"
        busy={busy}
        submitDisabled={!password}
        error={error}
        onSubmit={() => act(() => api.updateSubscriber(subscriber.realm, subscriber.user, { password }))}
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
        <p className="field-hint">A phone registered as {subscriber.user} will be challenged with it at its next registration.</p>
      </FormModal>

      <FormModal
        open={dialogue === 'media'}
        title={`Media for ${subscriber.user}`}
        submitLabel="Save media"
        busy={busy}
        error={error}
        onSubmit={() => act(() => api.updateSubscriber(subscriber.realm, subscriber.user, {
          behaviour: { media_profile: profile, ...(realmDtmf !== undefined ? { dtmf } : {}) },
        }))}
        onCancel={close}
      >
        <SubscriberMediaField value={profile} realmProfile={realmProfile} busy={busy} onChange={setProfile} />
        {realmDtmf !== undefined && (
          <DtmfField
            value={dtmf}
            inherited={realmDtmf}
            inheritedFrom="Realm"
            busy={busy}
            onChange={setDtmf}
            hint="Set it for a phone that sends key presses differently from the rest of its realm."
          />
        )}
      </FormModal>

      <FormModal
        open={dialogue === 'attributes'}
        title={`Attributes for ${subscriber.user}`}
        submitLabel="Save attributes"
        busy={busy}
        submitDisabled={'problem' in parsedAttributes}
        error={error}
        onSubmit={() => {
          if ('attributes' in parsedAttributes) act(() => api.updateSubscriber(subscriber.realm, subscriber.user, { attributes: parsedAttributes.attributes }));
        }}
        onCancel={close}
      >
        <AttributesField
          value={attributes}
          busy={busy}
          onChange={setAttributes}
          hint="Anything the routing scripts read about this subscriber, such as a group or the room it joins by default; the node itself reads none of it."
        />
      </FormModal>

      <ConfirmModal
        open={dialogue === 'delete'}
        title={`Delete ${subscriber.user}?`}
        confirmLabel="Delete subscriber"
        destructive
        busy={busy}
        onCancel={close}
        onConfirm={() => act(() => api.deleteSubscriber(subscriber.realm, subscriber.user))}
      >
        <p>
          <strong>{subscriber.uri}</strong> will be removed, and its registrations go with it. This
          cannot be undone.
        </p>
        {error && <p className="error-message" role="alert">{error}</p>}
      </ConfirmModal>
    </li>
  );
}

/**
 * The subscribers of one realm, from `/realms/{realm}/subscribers`.
 *
 * The realm is a query parameter so the screen can open with none chosen, in
 * which case it asks for one.
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
  const chosen = realms.value?.find((candidate) => candidate.name === realm);
  const realmProfile = chosen?.behaviour_effective.media_profile;
  const realmDtmf = chosen?.behaviour_effective.dtmf;

  return (
    <>
      <h1>Subscribers</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Subscribers in a realm</h2>
            <p>
              A subscriber is one SIP identity in one realm: what a phone registers as to make
              and receive calls. Its password is only ever sent here; the node keeps the digest
              and authenticates against that. A subscriber is not a user of this console.
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
          <select value={realm} onChange={(event) => setParams(event.target.value ? { realm: event.target.value } : {})}>
            <option value="">Choose a realm</option>
            {(realms.value ?? []).map((candidate) => (
              <option key={candidate.name} value={candidate.name}>{candidate.name}</option>
            ))}
          </select>
        </label>

        {realms.error && <ErrorMessage error={realms.error} />}
        {result.error && <ErrorMessage error={result.error} />}

        {!realm ? (
          <Empty>Choose a realm to see its subscribers.</Empty>
        ) : result.loading ? (
          <Loading />
        ) : !result.error && (
          <>
            <div className="panel-actions">
              <button className="primary-button" type="button" onClick={() => setAdding(true)}>Add a subscriber</button>
            </div>
            {adding && <NewSubscriberDialogue api={api} realm={realm} realmProfile={realmProfile} onClose={() => setAdding(false)} onSaved={onChanged} />}
            {(result.value ?? []).length === 0 ? (
              <Empty>{realm} has no subscribers yet.</Empty>
            ) : (
              <ul className="record-list">
                {(result.value ?? []).map((subscriber) => (
                  <SubscriberRow key={subscriber.user} api={api} subscriber={subscriber} realmProfile={realmProfile} realmDtmf={realmDtmf} onChanged={onChanged} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </>
  );
}
