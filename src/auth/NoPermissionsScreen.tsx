import { Link } from 'react-router-dom';
import type { SessionInfo } from '../api/types';
import { routes } from '../app/routes';
import { describeWho } from './roles';

/**
 * What a user with no roles sees: a clear statement, not an empty console.
 *
 * A user with no roles is a real state rather than a mistake. It is the
 * default for a new user and the state of one being set up or wound down, so
 * it is said plainly, with who is signed in and what to do about it.
 */
export function NoPermissionsScreen({ info }: { info: SessionInfo }) {
  return (
    <section className="panel login-panel">
      <div className="panel-heading">
        <div>
          <h1>No permissions</h1>
          <p>
            You are signed in as <strong>{describeWho(info)}</strong>
            {info.display_name ? <> ({info.username})</> : null}, and
            this user has no roles, so there is nothing here it can see or change.
          </p>
          <p>
            Ask an administrator of this node, somebody with the Manage users role, to give you the
            roles you need.
          </p>
          <p>
            The <Link to={routes.phone}>phone</Link> needs no role: it signs in to a SIP line of its own.
          </p>
        </div>
      </div>
    </section>
  );
}
