import { useEffect, useState } from 'react';
import type { AdminApi } from '../api/AdminApi';
import { ApiError } from '../api/errors';
import { isEncrypted, type Role } from '../api/types';
import { can } from '../auth/roles';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { useSubmit } from '../hooks/useSubmit';
import { ConfirmModal } from '../components/Modal';
import { Empty, ErrorMessage, Loading } from '../components/Status';
import { selfNode } from './OverviewScreen';

/** How often the bans are read again; nothing on the event stream says when they change. */
export const BANS_POLL_MS = 30_000;

/** How long until `until`, in whole minutes, or seconds in the last minute. */
export function timeLeft(until: string, now: number): string {
  const seconds = Math.ceil((Date.parse(until) - now) / 1000);
  if (!Number.isFinite(seconds)) return '-';
  if (seconds <= 0) return 'ending';
  if (seconds < 60) return `${seconds}s left`;
  return `${Math.ceil(seconds / 60)}m left`;
}

/** Lifts one ban or reopens one address of record, behind a dialogue. */
function HeldRow({ name, detail, until, now, canLift, liftLabel, title, explanation, lift, onLifted }: {
  name: string;
  detail: string;
  until: string;
  now: number;
  canLift: boolean;
  liftLabel: string;
  title: string;
  explanation: string;
  lift: () => Promise<void>;
  onLifted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { busy, error, clearError, run } = useSubmit();

  const confirm = () => {
    // A 404 is a ban this node no longer held, ended or lifted elsewhere; the other nodes were told all the same.
    void run(() => lift().catch((cause: unknown) => {
      if (!(cause instanceof ApiError && cause.status === 404)) throw cause;
    })).then((done) => {
      if (!done) return;
      setConfirming(false);
      onLifted();
    });
  };

  return (
    <li className="record-row">
      <div className="record-main" role="group" aria-label={name}>
        <span className="record-name">
          <span className="state-dot state-down" aria-hidden="true" />
          {name}
        </span>
        <span className="record-detail">{detail}</span>
      </div>
      <span className="record-tag state-tag-down">{timeLeft(until, now)}</span>
      {canLift && (
        <button className="secondary-button" type="button" aria-label={`${liftLabel} ${name}`} onClick={() => { clearError(); setConfirming(true); }}>
          {liftLabel}
        </button>
      )}
      <ConfirmModal
        open={confirming}
        title={title}
        confirmLabel={liftLabel}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      >
        <p>{explanation}</p>
        {error && <p className="error-message" role="alert">{error}</p>}
      </ConfirmModal>
    </li>
  );
}

/**
 * The addresses and addresses of record the cluster is holding off for
 * guessing passwords over SIP, with lifting for `manage-cluster`. Every node
 * holds the bans the others make, so the answering node's list is the
 * cluster's, less any made before it started.
 */
function Guessing({ api, roles }: { api: AdminApi; roles: readonly Role[] }) {
  const bans = useRefreshableAsync((signal) => api.listBans(signal), [api]);
  const closed = useRefreshableAsync((signal) => api.listClosedAors(signal), [api]);
  const refreshBans = bans.refresh;
  const refreshClosed = closed.refresh;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => { refreshBans(); refreshClosed(); }, BANS_POLL_MS);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(poll);
    };
  }, [refreshBans, refreshClosed]);

  const canLift = can(roles, 'manage-cluster');
  const refreshing = bans.refreshing || closed.refreshing;

  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Banned addresses</h2>
            <p>
              An address that answers too many sign-in challenges wrongly is ignored for a while:
              nothing it sends gets an answer. Read again every 30 seconds.
            </p>
            {canLift && (
              <p className="field-hint">
                Lifting a ban also forgets the address&apos;s wrong passwords, so its next mistake
                does not ban it straight back.
              </p>
            )}
          </div>
          <button className="secondary-button" type="button" onClick={() => { refreshBans(); refreshClosed(); }} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {bans.error && <ErrorMessage error={bans.error} />}
        {bans.loading ? <Loading /> : bans.value && (bans.value.length === 0 ? <Empty>No address is banned.</Empty> : (
          <ul className="record-list">
            {bans.value.map((ban) => (
              <HeldRow
                key={ban.source}
                name={ban.source}
                detail={`Banned by ${ban.node}, until ${new Date(ban.until).toLocaleTimeString()}.`}
                until={ban.until}
                now={now}
                canLift={canLift}
                liftLabel="Lift ban"
                title={`Lift the ban on ${ban.source}?`}
                explanation="Every node answers this address again at once. If it is still guessing, it will be banned again after a few more wrong passwords."
                lift={() => api.liftBan(ban.source)}
                onLifted={refreshBans}
              />
            ))}
          </ul>
        ))}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Closed SIP addresses</h2>
            <p>
              A SIP address whose password is guessed at too often, from anywhere, is closed for a
              while to every address that has not signed in as it lately. Its own phones carry on
              registering; anything else trying it is refused and told when to try again.
            </p>
          </div>
        </div>

        {closed.error && <ErrorMessage error={closed.error} />}
        {closed.loading ? <Loading /> : closed.value && (closed.value.length === 0 ? <Empty>No SIP address is closed.</Empty> : (
          <ul className="record-list">
            {closed.value.map((closure) => (
              <HeldRow
                key={closure.aor}
                name={closure.aor}
                detail={`Closed by ${closure.node}, until ${new Date(closure.until).toLocaleTimeString()}.`}
                until={closure.until}
                now={now}
                canLift={canLift}
                liftLabel="Reopen"
                title={`Reopen ${closure.aor}?`}
                explanation="Every node lets new phones sign in as this address again at once, and forgets the wrong passwords counted against it."
                lift={() => api.reopenAor(closure.aor)}
                onLifted={refreshClosed}
              />
            ))}
          </ul>
        ))}
      </section>
    </>
  );
}

/**
 * Whether anything unencrypted is listening, and who is being held off for
 * guessing passwords. AthenaSIP is TLS-first and plaintext is opt-in; the
 * node list says which transports are up.
 */
export function SecurityScreen({ api, roles }: { api: AdminApi; roles: readonly Role[] }) {
  const result = useRefreshableAsync((signal) => api.nodes(signal), [api]);
  const self = result.value && selfNode(result.value);
  const plaintext = (self?.transports ?? []).filter((transport) => !isEncrypted(transport.transport));

  return (
    <>
      <h1>Security</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Transport encryption</h2>
            <p>
              AthenaSIP is TLS-first: unencrypted SIP has to be turned on deliberately, with{' '}
              <code>allow_unencrypted</code>. Anything listed here is carrying signalling in the
              clear.
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={result.refresh} disabled={result.refreshing}>
            {result.refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {result.error && <ErrorMessage error={result.error} />}
        {result.loading ? <Loading /> : self && (
          plaintext.length === 0 ? (
            <p className="field-hint" role="status">
              <span className="state-dot state-ok" aria-hidden="true" /> No unencrypted transport is enabled.
            </p>
          ) : (
            <ul className="record-list">
              {plaintext.map((transport) => (
                <li className="record-row" key={transport.transport}>
                  <div className="record-main" role="group" aria-label={transport.transport.toUpperCase()}>
                    <span className="record-name">
                      <span className="state-dot state-warn" aria-hidden="true" />
                      {transport.transport.toUpperCase()}
                    </span>
                    <span className="record-detail">{transport.address}:{transport.port}</span>
                  </div>
                  <span className="record-tag state-tag-warn">Unencrypted</span>
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      <Guessing api={api} roles={roles} />
    </>
  );
}

export function TlsScreen({ api }: { api: AdminApi }) {
  const result = useRefreshableAsync((signal) => api.nodes(signal), [api]);
  const self = result.value && selfNode(result.value);
  const secure = (self?.transports ?? []).filter((transport) => isEncrypted(transport.transport));

  return (
    <>
      <h1>TLS</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Encrypted listeners</h2>
            <p>
              The TLS and secure WebSocket listeners this node advertises. The certificate and
              cipher policy are read from the node's configuration; the API does not expose them
              yet, so they cannot be shown or changed from here.
            </p>
          </div>
        </div>

        {result.error && <ErrorMessage error={result.error} />}
        {result.loading ? <Loading /> : self && (
          secure.length === 0 ? (
            <p className="field-hint">This node advertises no TLS or WSS listener.</p>
          ) : (
            <dl className="readout">
              {secure.map((transport) => (
                <div key={transport.transport} style={{ display: 'contents' }}>
                  <dt>{transport.transport.toUpperCase()}</dt>
                  <dd><code>{transport.uri}</code></dd>
                </div>
              ))}
            </dl>
          )
        )}
      </section>
    </>
  );
}
