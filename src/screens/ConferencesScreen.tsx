import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminApi } from '../api/AdminApi';
import { retryAfter } from '../api/errors';
import type { Conference, ConferenceParticipant, Role } from '../api/types';
import { can } from '../auth/roles';
import { routes } from '../app/routes';
import { useEventRefresh } from '../hooks/useEvents';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { useSubmit } from '../hooks/useSubmit';
import { ConfirmModal } from '../components/Modal';
import { Empty, ErrorMessage, Loading } from '../components/Status';
import { hangUpProblem } from './CallsScreen';

/** How often the rooms are read again while the event stream is not live. */
export const ROOMS_POLL_MS = 5000;

const STATE_TONE: Record<ConferenceParticipant['state'], 'ok' | 'warn' | 'down'> = {
  Initial: 'warn',
  Trying: 'warn',
  Ringing: 'warn',
  Connected: 'ok',
  Closing: 'down',
};

/** How long ago someone joined, in minutes and seconds. */
export function sinceJoined(joinedAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(joinedAt)) / 1000));
  if (!Number.isFinite(seconds)) return '-';
  const hours = Math.floor(seconds / 3600);
  const clock = `${Math.floor((seconds % 3600) / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${clock.padStart(5, '0')}` : clock;
}

/** The room's name as people say it: the user part of its URI. */
export function roomName(uri: string): string {
  return /^sips?:([^@;]+)/i.exec(uri)?.[1] ?? uri;
}

function ParticipantRow({ api, room, participant, now, canRemove, onRemoved }: {
  api: AdminApi;
  room: Conference;
  participant: ConferenceParticipant;
  now: number;
  canRemove: boolean;
  onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { busy, error, failure, clearError, run } = useSubmit();
  const tone = STATE_TONE[participant.state] ?? 'warn';

  const remove = () => {
    void run(() => api.removeConferenceParticipant(room.uri, participant.call)).then((done) => {
      if (!done) return;
      setConfirming(false);
      onRemoved();
    });
  };

  return (
    <li className="record-row">
      <div className="record-main" role="group" aria-label={participant.identity}>
        <span className="record-name">
          <span className={`state-dot state-${tone}`} aria-hidden="true" />
          {participant.identity}
        </span>
        <span className="record-detail">
          {participant.subscriber ? 'A subscriber' : 'From a trunk'}, on {participant.node}. Call-ID <code>{participant.call}</code>
        </span>
      </div>
      <span className={`record-tag state-tag-${tone}`}>{participant.state}</span>
      <span className="record-tag">{sinceJoined(participant.joined_at, now)}</span>
      {canRemove && participant.state === 'Connected' && (
        <button className="secondary-button" type="button" onClick={() => { clearError(); setConfirming(true); }}>
          Remove
        </button>
      )}
      <ConfirmModal
        open={confirming}
        title={`Remove ${participant.identity} from ${roomName(room.uri)}?`}
        confirmLabel="Remove"
        destructive
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      >
        <p>
          The node ends this participant&apos;s call with a BYE to both ends. Their phone sees the
          call end; the room and everybody else in it carry on. Nothing stops them dialling the
          room again.
        </p>
        {error && <p className="error-message" role="alert">{hangUpProblem(failure) ?? error}</p>}
      </ConfirmModal>
    </li>
  );
}

function Room({ api, room, now, canRemove, onChanged }: {
  api: AdminApi;
  room: Conference;
  now: number;
  canRemove: boolean;
  onChanged: () => void;
}) {
  const connected = room.participants.filter((participant) => participant.state === 'Connected').length;
  return (
    <section className="panel" aria-label={`Room ${room.uri}`}>
      <div className="panel-heading">
        <div>
          <h2>{roomName(room.uri)}</h2>
          <p>
            <code>{room.uri}</code>,{' '}
            {room.focus
              ? <>served by the focus trunk <Link to={routes.trunks}>{room.focus}</Link></>
              : 'waiting for its focus to answer'}
            . {connected} of {room.participants.length} connected.
          </p>
        </div>
      </div>
      <ul className="record-list">
        {room.participants.map((participant) => (
          <ParticipantRow
            key={participant.call}
            api={api}
            room={room}
            participant={participant}
            now={now}
            canRemove={canRemove}
            onRemoved={onChanged}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * The conference rooms with somebody in them (RFC 4579), across the cluster.
 *
 * A room is a name a focus answers to: it exists while someone is in it, and
 * nothing here creates or closes one. Who is in each is what the node routed,
 * one call per participant; the focus's own roster, with its mute state, is
 * the server's next step. Muting and locking are the focus's and are not
 * offered through the node.
 */
export function ConferencesScreen({ api, roles }: { api: AdminApi; roles: readonly Role[] }) {
  const result = useRefreshableAsync((signal) => api.listConferences(signal), [api]);
  const { refresh } = result;
  // Somebody joining or leaving is a call starting or ending.
  const live = useEventRefresh(api, ['calls'], refresh, can(roles, 'view-cluster-status'));

  const [, setTick] = useState(0);
  const holdFor = retryAfter(result.error);
  useEffect(() => {
    if (holdFor !== undefined) {
      const timer = window.setTimeout(refresh, holdFor * 1000);
      return () => window.clearTimeout(timer);
    }
    // The stream says when to read; with it live, only the clock moves.
    const timer = window.setInterval(live ? () => setTick((tick) => tick + 1) : refresh, live ? 1000 : ROOMS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh, holdFor, live]);

  const now = Date.now();
  const canRemove = can(roles, 'manage-cluster');

  return (
    <>
      <h1>Conferences</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Rooms in use</h2>
            <p>
              A room is a name dialled in a realm, such as <code>conf-sales</code>, that a conference
              focus answers to. It exists while somebody is in it: dialling it opens it and the last
              one out closes it. Which names are rooms is set on the focus&apos;s trunk, under{' '}
              <Link to={routes.trunks}>Trunks</Link>. {live ? 'Updated as people join and leave.' : 'Updated every five seconds.'}
            </p>
            <p className="field-hint">
              Each participant is a call the node routed to the focus. Muting someone and locking a
              room belong to the focus and are not offered here.
              {canRemove ? ' Removing someone ends their call.' : ''}
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={refresh} disabled={result.refreshing}>
            {result.refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {result.error && <ErrorMessage error={result.error} />}
        {result.loading ? <Loading /> : result.value?.length === 0 && <Empty>Nobody is in a conference.</Empty>}
      </section>

      {result.value?.map((room) => (
        <Room key={room.uri} api={api} room={room} now={now} canRemove={canRemove} onChanged={refresh} />
      ))}
    </>
  );
}
