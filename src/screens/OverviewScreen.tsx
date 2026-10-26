import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminApi } from '../api/AdminApi';
import { ApiError } from '../api/errors';
import type { ClusterNode, Health, NodeTransport, PolicyReload, Role } from '../api/types';
import { isEncrypted } from '../api/types';
import { can } from '../auth/roles';
import { useEventRefresh } from '../hooks/useEvents';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { useSubmit } from '../hooks/useSubmit';
import { ConfirmModal } from '../components/Modal';
import { ErrorMessage, Loading } from '../components/Status';
import { routes } from '../app/routes';

/** A node's health as a tone and a word. A degraded node is serving nothing: its datastore is gone. */
export function healthState(health: Health): { label: string; tone: 'ok' | 'down' } {
  return health.status === 'ok'
    ? { label: 'Serving', tone: 'ok' }
    : { label: 'Degraded: the datastore is not connected', tone: 'down' };
}

/** A 403 means the user lacks the role, which is not a fault. */
function notForThisLogin(error: Error | undefined): boolean {
  return error instanceof ApiError && error.isForbidden;
}

/** A node's state as a tone and a word. A stale report is not trusted, whatever status it carries. */
export function nodeState(node: ClusterNode): { label: string; tone: 'ok' | 'warn' | 'down' } {
  if (node.stale) return { label: 'No recent report', tone: 'warn' };
  switch (node.status) {
    case 'ok': return { label: 'Serving', tone: 'ok' };
    case 'degraded': return { label: 'Degraded', tone: 'warn' };
    case 'stopped': return { label: 'Stopped', tone: 'down' };
    case 'down': return { label: 'Down', tone: 'down' };
    default: return { label: 'Unknown', tone: 'warn' };
  }
}

/** The node that answered; each node marks itself in its own list. */
export function selfNode(nodes: readonly ClusterNode[]): ClusterNode | undefined {
  return nodes.find((node) => node.self) ?? nodes[0];
}

/** A policy as one string to compare: the driver and the scripts' fingerprint. */
function policyKey(node: ClusterNode): string | undefined {
  return node.policy && `${node.policy.driver}\n${node.policy.fingerprint ?? ''}`;
}

/**
 * The nodes whose routing policy differs from the one most nodes run, or
 * none when they agree. A node that reported no policy is not counted
 * either way. With a tie, every node outside the largest group in the
 * order listed is out of step; this node is listed first, so its own
 * policy wins a tie.
 */
export function policyStragglers(nodes: readonly ClusterNode[]): ClusterNode[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const key = policyKey(node);
    if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size < 2) return [];
  let common: string | undefined;
  for (const [key, count] of counts) if (common === undefined || count > counts.get(common)!) common = key;
  return nodes.filter((node) => { const key = policyKey(node); return key !== undefined && key !== common; });
}

/** A fingerprint short enough to read and compare by eye. */
export function shortFingerprint(fingerprint: string | undefined): string {
  return fingerprint ? fingerprint.slice(0, 12) : 'none';
}

/** Has the answering node read its routing scripts again, after asking. */
function ReloadPolicy({ api, onReloaded }: { api: AdminApi; onReloaded: () => void }) {
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<PolicyReload>();
  const { busy, error, run } = useSubmit();
  const reload = () => {
    void run(async () => setResult(await api.reloadPolicy())).then((done) => {
      if (!done) return;
      setAsking(false);
      onReloaded();
    });
  };
  return (
    <>
      <button className="secondary-button" type="button" onClick={() => { setResult(undefined); setAsking(true); }}>
        Reload scripts
      </button>
      {result && (
        <p className="field-hint" role="status">
          This node now runs {result.driver}{result.fingerprint ? `, scripts ${shortFingerprint(result.fingerprint)}` : ''}.
        </p>
      )}
      <ConfirmModal open={asking} title="Reload the routing scripts?" confirmLabel="Reload" busy={busy} onConfirm={reload} onCancel={() => setAsking(false)}>
        <p>
          This node reads its routing scripts from disk again. Calls already being routed finish
          on the old ones. Scripts that do not load are refused with the file and line, and the
          ones in force stay. Each node reads its own scripts, so a cluster is reloaded node by
          node; this reloads only the node this console is talking to.
        </p>
        {error && <p className="error-message" role="alert">{error}</p>}
      </ConfirmModal>
    </>
  );
}

/**
 * What this node is and whether it is serving.
 *
 * Health needs no role; the node list and registrations need Status, and the
 * realm count Manage users. Each panel loads on its own, so a user lacking a
 * role still sees the rest.
 */
export function OverviewScreen({ api, roles = [] }: { api: AdminApi; roles?: readonly Role[] }) {
  const health = useRefreshableAsync((signal) => api.health(signal), [api]);
  const nodes = useRefreshableAsync((signal) => api.nodes(signal), [api]);
  const registrations = useRefreshableAsync((signal) => api.listRegistrations(undefined, signal), [api]);
  const realms = useRefreshableAsync((signal) => api.listRealms(signal), [api]);

  const refresh = () => { health.refresh(); nodes.refresh(); registrations.refresh(); realms.refresh(); };
  const refreshing = health.refreshing || nodes.refreshing || registrations.refreshing || realms.refreshing;
  const self = nodes.value && selfNode(nodes.value);
  const status = can(roles, 'view-cluster-status');
  // Nodes report on the bus every status interval, and a registration is published as it is written.
  useEventRefresh(api, ['nodes'], nodes.refresh, status);
  useEventRefresh(api, ['subscribers'], registrations.refresh, status);
  const stragglers = nodes.value ? policyStragglers(nodes.value) : [];

  return (
    <>
      <h1>Overview</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>This node</h2>
            <p>What this AthenaSIP process is, and whether it can serve a registration.</p>
          </div>
          <button className="secondary-button" type="button" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {health.error && <ErrorMessage error={health.error} />}
        {!health.value ? (health.loading && <Loading />) : (
          <dl className="readout">
            <dt>State</dt>
            <dd>
              <span className={`state-dot state-${healthState(health.value).tone}`} aria-hidden="true" />{' '}
              {healthState(health.value).label}
            </dd>
            <dt>Node</dt><dd>{health.value.node}</dd>
            <dt>Version</dt><dd>{health.value.version}</dd>
            <dt>Datastore</dt><dd><code>{health.value.datastore}</code></dd>
            <dt>Realms</dt>
            <dd>{realms.value ? realms.value.length : notForThisLogin(realms.error) ? 'Not available to this login' : '-'}</dd>
            <dt>Registrations</dt>
            <dd>
              {registrations.value
                ? <Link to={routes.registrations}>{registrations.value.length}</Link>
                : notForThisLogin(registrations.error) ? 'Not available to this login' : '-'}
            </dd>
          </dl>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Cluster</h2>
            <p>
              Every node serving these realms, as each last described itself. This node first;
              the others as they reported on the event bus. A node whose reports stopped is still
              listed, so it can be told from one never heard of. The nodes of one cluster should
              run the same routing scripts.
            </p>
          </div>
          {can(roles, 'manage-cluster') && <div className="panel-actions"><ReloadPolicy api={api} onReloaded={nodes.refresh} /></div>}
        </div>

        {stragglers.length > 0 && (
          <p className="error-message" role="alert">
            The nodes disagree on their routing scripts: {stragglers.map((node) => node.id).join(', ')}{' '}
            {stragglers.length === 1 ? 'runs' : 'run'} different ones from the rest. A call may be
            routed differently depending on the node it reaches. Copy the same scripts to every node
            and reload each.
          </p>
        )}

        {notForThisLogin(nodes.error)
          ? <p className="field-hint">This login&apos;s roles do not include the node&apos;s status.</p>
          : nodes.error && <ErrorMessage error={nodes.error} />}
        {!nodes.value ? (nodes.loading && <Loading />) : (
          <ul className="record-list">
            {nodes.value.map((node) => {
              const state = nodeState(node);
              return (
                <li className="record-row" key={node.id}>
                  <div className="record-main" role="group" aria-label={`Node ${node.id}`}>
                    <span className="record-name">
                      <span className={`state-dot state-${state.tone}`} aria-hidden="true" />
                      {node.id}
                    </span>
                    {node.at && <span className="record-detail">Reported {new Date(node.at).toLocaleString()}</span>}
                    {node.policy && (
                      <span className="record-detail">
                        Routing: {node.policy.driver}{node.policy.fingerprint && <>, scripts <code title={node.policy.fingerprint}>{shortFingerprint(node.policy.fingerprint)}</code></>}
                      </span>
                    )}
                    {node.cluster && <span className="record-detail">Peers reach it at <code>{node.cluster.address}:{node.cluster.port}</code></span>}
                  </div>
                  {node.self && <span className="record-tag">This node</span>}
                  {node.version && <span className="record-tag">{node.version}</span>}
                  {stragglers.includes(node) && <span className="record-tag state-tag-warn">Different scripts</span>}
                  <span className={`record-tag state-tag-${state.tone}`}>{state.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Transports</h2>
            <p>
              The listeners this node advertises, with the URI a client would use for each. A
              transport that is switched off is not listed. The address is{' '}
              <code>sip.public_address</code> when it is set; a node that shows{' '}
              <code>0.0.0.0</code> here has not been told the address clients reach it on.
            </p>
          </div>
        </div>

        {notForThisLogin(nodes.error)
          ? <p className="field-hint">This login&apos;s roles do not include the node&apos;s status.</p>
          : nodes.error && <ErrorMessage error={nodes.error} />}
        {!self ? (nodes.loading && <Loading />) : (
          <ul className="record-list">
            {self.transports.map((transport) => <TransportRow key={transport.transport} transport={transport} />)}
          </ul>
        )}
      </section>
    </>
  );
}

function TransportRow({ transport }: { transport: NodeTransport }) {
  const encrypted = isEncrypted(transport.transport);
  return (
    <li className="record-row">
      <div className="record-main" role="group" aria-label={transport.transport.toUpperCase()}>
        <span className="record-name">
          <span className={`state-dot state-${encrypted ? 'ok' : 'warn'}`} aria-hidden="true" />
          {transport.transport.toUpperCase()}
        </span>
        <span className="record-detail"><code>{transport.uri}</code></span>
      </div>
      <span className={`record-tag state-tag-${encrypted ? 'ok' : 'warn'}`}>{encrypted ? 'Encrypted' : 'Unencrypted'}</span>
    </li>
  );
}
