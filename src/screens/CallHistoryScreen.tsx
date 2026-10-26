import { useState } from 'react';
import type { AdminApi } from '../api/AdminApi';
import type { CallRecord, Role } from '../api/types';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { Empty, ErrorMessage, Loading } from '../components/Status';

/** How many records may be asked for at once; the node takes 1 to 1000. */
export const HISTORY_LIMITS = [100, 500, 1000] as const;

/** A call's length in words: talking time, or how it ended unanswered. */
export function recordOutcome(record: CallRecord): { label: string; tone: 'ok' | 'warn' } {
  if (!record.answered_at) return { label: 'Not answered', tone: 'warn' };
  const seconds = record.duration;
  const hours = Math.floor(seconds / 3600);
  const clock = `${Math.floor((seconds % 3600) / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return { label: hours > 0 ? `${hours}:${clock.padStart(5, '0')}` : clock, tone: 'ok' };
}

function RecordRow({ record }: { record: CallRecord }) {
  const outcome = recordOutcome(record);
  const ended = record.ended_at ?? record.created_at;
  return (
    <li className="record-row">
      <div className="record-main" role="group" aria-label={record.id}>
        <span className="record-name">
          <span className={`state-dot state-${outcome.tone}`} aria-hidden="true" />
          {record.caller ?? 'unknown caller'} to {record.callee ?? 'unknown callee'}
        </span>
        <span className="record-detail">
          {ended ? `Ended ${new Date(ended).toLocaleString()}` : 'End not recorded'}
          {record.nodes.length > 0 && `, carried by ${record.nodes.join(' then ')}`}
        </span>
        <span className="record-detail">Call-ID <code>{record.id}</code></span>
      </div>
      <span className={`record-tag state-tag-${outcome.tone}`}>{outcome.label}</span>
      <span className="record-tag">{record.media_engine ? `Relayed: ${record.media_engine}` : 'Not relayed'}</span>
    </li>
  );
}

/**
 * Calls that have ended, newest first, as the node keeps them (thirty days by
 * default, `calls.history_retention`). A call refused before anything rang
 * has no record.
 */
export function CallHistoryScreen({ api }: { api: AdminApi; roles?: readonly Role[] }) {
  const [limit, setLimit] = useState<number>(HISTORY_LIMITS[0]);
  const result = useRefreshableAsync((signal) => api.listCallRecords(limit, signal), [api, limit]);

  return (
    <>
      <h1>Call history</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Ended calls</h2>
            <p>
              Every call that has ended, newest first, wherever in the cluster it was carried. The
              length is talking time, from the answer to the end. A conference shows as one call per
              participant, each to the room.
            </p>
          </div>
          <div className="panel-actions">
            <label className="field inline-field">
              <span>Show</span>
              <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                {HISTORY_LIMITS.map((option) => <option key={option} value={option}>Latest {option}</option>)}
              </select>
            </label>
            <button className="secondary-button" type="button" onClick={result.refresh} disabled={result.refreshing}>
              {result.refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {result.error && <ErrorMessage error={result.error} />}
        {result.loading ? <Loading /> : !result.value ? null : result.value.length === 0 ? (
          <Empty>No call has ended yet.</Empty>
        ) : (
          <ul className="record-list">
            {result.value.map((record) => <RecordRow key={record.id} record={record} />)}
          </ul>
        )}
      </section>
    </>
  );
}
