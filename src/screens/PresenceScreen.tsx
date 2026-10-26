import { useState } from 'react';
import type { AdminApi } from '../api/AdminApi';
import { ApiError } from '../api/errors';
import type { Presence, PresenceSubscription, Role } from '../api/types';
import { can } from '../auth/roles';
import { useEventRefresh } from '../hooks/useEvents';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { useSubmit } from '../hooks/useSubmit';
import { Empty, ErrorMessage, Loading } from '../components/Status';

/** What each package tells a watcher, in words. */
export const PACKAGE_TEXT: Record<PresenceSubscription['package'], string> = {
  dialog: 'Busy lamp (dialog)',
  presence: 'Online status (presence)',
};

/** Why a presence lookup found nothing, in words, or undefined for any other failure. */
export function presenceProblem(error: unknown): string | undefined {
  if (!(error instanceof ApiError) || error.status !== 404) return undefined;
  return error.code === 'presence_off'
    ? 'Presence is off on this node, or its datastore cannot hold it.'
    : 'There is no such subscriber.';
}

function SubscriptionRow({ subscription, now }: { subscription: PresenceSubscription; now: number }) {
  const left = Math.max(0, subscription.expires_at - Math.floor(now / 1000));
  return (
    <li className="record-row">
      <div className="record-main" role="group" aria-label={`${subscription.watcher} watches ${subscription.presentity}`}>
        <span className="record-name">{subscription.watcher}</span>
        <span className="record-detail">watches <code>{subscription.presentity}</code></span>
        <span className="record-detail">Held by {subscription.node_id || 'this node'}, {left > 0 ? `${Math.ceil(left / 60)} min left` : 'lapsing'}</span>
      </div>
      <span className="record-tag">{PACKAGE_TEXT[subscription.package] ?? subscription.package}</span>
    </li>
  );
}

function Lookup({ api }: { api: AdminApi }) {
  const [address, setAddress] = useState('');
  const [found, setFound] = useState<Presence>();
  const { busy, error, failure, run } = useSubmit();
  const parsed = /^(?:sips?:)?([^@\s]+)@([^@\s;>]+)$/i.exec(address.trim());

  const look = () => {
    if (!parsed) return;
    setFound(undefined);
    void run(async () => setFound(await api.subscriberPresence(parsed[2], parsed[1])));
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>One subscriber</h2>
          <p>
            What a buddy list is told about a subscriber: what its own client published, or, when it
            published nothing, online while it has a registration.
          </p>
        </div>
      </div>
      <form className="inline-form" onSubmit={(event) => { event.preventDefault(); look(); }}>
        <label className="field">
          <span>Subscriber</span>
          <input
            type="text"
            value={address}
            placeholder="1001@example.com"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setAddress(event.target.value)}
          />
        </label>
        <button className="primary-button" type="submit" disabled={busy || !parsed}>{busy ? 'Looking...' : 'Look up'}</button>
      </form>
      {error && <p className="error-message" role="alert">{presenceProblem(failure) ?? error}</p>}
      {found && (
        <dl className="readout">
          <dt>Subscriber</dt><dd>{found.subscriber}</dd>
          <dt>State</dt>
          <dd>
            <span className={`state-dot state-${found.basic === 'open' ? 'ok' : 'down'}`} aria-hidden="true" />{' '}
            {found.basic === 'open' ? 'Online' : 'Offline'}
          </dd>
          <dt>From</dt><dd>{found.source === 'published' ? 'What its client published' : 'Whether it has a registration'}</dd>
          <dt>Publications</dt><dd>{found.publications?.length ?? 0}</dd>
          {found.document && (<><dt>Document</dt><dd><pre className="presence-document">{found.document}</pre></dd></>)}
        </dl>
      )}
    </section>
  );
}

/**
 * Presence and busy lamps (RFC 3856, RFC 4235), which the node serves itself.
 * The list of who watches whom needs View cluster status; looking up one
 * subscriber needs Manage subscribers.
 */
export function PresenceScreen({ api, roles }: { api: AdminApi; roles: readonly Role[] }) {
  const subscriptions = useRefreshableAsync((signal) => api.listPresenceSubscriptions(signal), [api]);
  useEventRefresh(api, ['presence'], subscriptions.refresh, can(roles, 'view-cluster-status'));
  const now = Date.now();
  const off = subscriptions.error instanceof ApiError && subscriptions.error.status === 404;

  return (
    <>
      <h1>Presence</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Who is watching whom</h2>
            <p>
              Every busy lamp key and buddy list entry a phone has subscribed to, across the cluster,
              with the node that sends its updates. A key for a conference room lights while anyone
              is in the room.
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={subscriptions.refresh} disabled={subscriptions.refreshing}>
            {subscriptions.refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {off ? <p className="field-hint">This node does not serve presence.</p> : subscriptions.error && <ErrorMessage error={subscriptions.error} />}
        {subscriptions.loading ? <Loading /> : !subscriptions.value ? null : subscriptions.value.length === 0 ? (
          <Empty>No phone is watching anyone.</Empty>
        ) : (
          <ul className="record-list">
            {subscriptions.value.map((subscription) => <SubscriptionRow key={subscription.id} subscription={subscription} now={now} />)}
          </ul>
        )}
      </section>

      {can(roles, 'manage-realm-subscribers') && <Lookup api={api} />}
    </>
  );
}
