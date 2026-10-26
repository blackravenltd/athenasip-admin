import { useEffect, useState } from 'react';
import type { AdminApi } from '../api/AdminApi';
import { ApiError } from '../api/errors';
import type { Conference, ConferenceParticipant, ConferencePrefix, Role } from '../api/types';
import { can } from '../auth/roles';
import { ErrorMessage, Loading } from '../components/Status';
import { useEventRefresh } from '../hooks/useEvents';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import type { CallState } from '../softphone/Softphone';
import { callInProgress } from '../softphone/words';
import { roomUri, type Room } from './conference';
import { userOf } from './dial';
import { addressOf, when } from './PhoneAside';

/** How often the roster is read again while the event stream is not live. */
export const ROSTER_POLL_MS = 5000;

/**
 * The realm's conference rooms: a way to join one, and, while a call is up
 * to a room, who is in it.
 *
 * A room is joined with one ordinary call to its URI, so mute, hold, the dial
 * pad and hanging up are the dialler's as on any call. Muting others, locking
 * and creating rooms belong to the focus and are not offered. Shown only when
 * the line's realm has a prefix, or while a call is in a room.
 */
export function PhoneConferences({ api, roles, realm, prefixes, room, call, ownUri, onJoin }: {
  api: AdminApi;
  roles: readonly Role[];
  realm?: string;
  prefixes: readonly ConferencePrefix[];
  /** The room the current call is to, when it is one. */
  room?: Room;
  call: CallState;
  ownUri: string;
  onJoin: (uri: string, video: boolean) => void;
}) {
  const inRoom = room && callInProgress(call) && call !== 'incoming';
  if (!inRoom && (!realm || prefixes.length === 0)) return null;

  return (
    <section className="panel" aria-labelledby="phone-conferences-heading">
      <h2 id="phone-conferences-heading">{inRoom ? `In conference ${room.name}` : 'Conferences'}</h2>
      {inRoom ? (
        <Roster api={api} roles={roles} room={room} call={call} ownUri={ownUri} />
      ) : (
        <JoinRoom realm={realm ?? ''} prefixes={prefixes} busy={callInProgress(call)} onJoin={onJoin} />
      )}
    </section>
  );
}

/** A room name, which prefix it is under when the realm has several, and Join. */
function JoinRoom({ realm, prefixes, busy, onJoin }: {
  realm: string;
  prefixes: readonly ConferencePrefix[];
  busy: boolean;
  onJoin: (uri: string, video: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState(0);
  const prefix = (prefixes[chosen] ?? prefixes[0]).prefix;
  const uri = roomUri(name, prefix, realm, prefixes);

  return (
    <form
      className="phone-line-form"
      onSubmit={(event) => { event.preventDefault(); if (uri && !busy) onJoin(uri, false); }}
    >
      {prefixes.length > 1 && (
        <label className="field">
          <span>Rooms under</span>
          <select value={chosen} onChange={(event) => setChosen(Number(event.target.value))}>
            {prefixes.map((entry, index) => (
              <option key={entry.prefix} value={index}>{`${entry.prefix} (${entry.trunk})`}</option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Room</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="sales" aria-label="Room" />
      </label>
      {uri && <p className="field-hint">Dials <code>{uri}</code></p>}
      <div className="phone-actions">
        <button className="primary-button" type="submit" disabled={!uri || busy}>Join</button>
        <button className="secondary-button" type="button" disabled={!uri || busy} onClick={() => uri && onJoin(uri, true)}>Join with video</button>
      </div>
      <p className="field-hint">
        A room exists once somebody dials it: there is nothing to create. Any name under{' '}
        {prefixes.map((entry) => entry.prefix).join(' or ')} in {realm} is a room. Muting others and
        locking a room are not available here.
      </p>
    </form>
  );
}

/** A participant's call state in words. */
function describeParticipant(state: ConferenceParticipant['state']): string {
  if (state === 'Connected') return 'In the room';
  if (state === 'Closing') return 'Leaving';
  return 'Joining';
}

/**
 * Who is in the room, read with the console user's View cluster status role,
 * not the line's. Re-read on the event stream's call events, or every few
 * seconds while it is not live.
 *
 * This is who the node routed to the room, from its call records, not yet
 * the focus's own list: there is no mute state until the node watches the
 * focus's RFC 4575 roster (the server's conferencing step 6).
 */
function Roster({ api, roles, room, call, ownUri }: {
  api: AdminApi;
  roles: readonly Role[];
  room: Room;
  call: CallState;
  ownUri: string;
}) {
  if (!can(roles, 'view-cluster-status')) {
    return <p className="field-hint">Who is in the room comes from the node&apos;s live calls, which need the View cluster status role.</p>;
  }
  return <RosterList api={api} room={room} call={call} ownUri={ownUri} />;
}

function RosterList({ api, room, call, ownUri }: { api: AdminApi; room: Room; call: CallState; ownUri: string }) {
  const own = addressOf(ownUri);
  const roster = useRefreshableAsync<Conference | null>(
    (signal) => api.getConference(room.uri, signal).catch((cause: unknown) => {
      // Nobody is in it as far as the node knows: not an error.
      if (cause instanceof ApiError && cause.status === 404) return null;
      throw cause;
    }),
    [api, room.uri],
  );
  const { refresh } = roster;
  const live = useEventRefresh(api, ['calls'], refresh);

  // This line's own leg appears once the focus answers.
  useEffect(() => {
    if (call === 'connected') refresh();
  }, [call, refresh]);

  useEffect(() => {
    if (live) return undefined;
    const timer = window.setInterval(refresh, ROSTER_POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, refresh]);

  const participants = roster.value?.participants ?? [];
  return (
    <>
      {roster.loading ? <Loading /> : roster.error ? <ErrorMessage error={roster.error} /> : participants.length === 0 ? (
        <p className="field-hint">Nobody else is in this room yet, or the focus has not answered.</p>
      ) : (
        <ul className="phone-list" aria-label="In the room">
          {participants.map((participant) => {
            const mine = own !== undefined && addressOf(participant.subscriber ?? participant.identity) === own;
            return (
              <li key={participant.call} className="phone-list-row">
                <div className="phone-list-main">
                  <span className="phone-list-name">
                    <span className={`state-dot state-${participant.state === 'Connected' ? 'ok' : 'warn'}`} aria-hidden="true" />
                    {userOf(participant.identity)}{mine ? ' (you)' : ''}
                  </span>
                  <span className="phone-list-detail">
                    {describeParticipant(participant.state)}, joined {when(Date.parse(participant.joined_at))}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="field-hint">
        Who the node routed to this room. The room&apos;s own list, with who is muted, is not
        available yet.
      </p>
    </>
  );
}
