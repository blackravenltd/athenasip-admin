import { Suspense, lazy, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { AdminApi } from './api/AdminApi';
import type { Role } from './api/types';
import { SectionNav } from './components/SectionNav';
import { sectionNavFor, topNav, visible } from './app/navigation';
import { routes } from './app/routes';
import logoUrl from './assets/athenasip_small_white.svg?url';
import type { Session } from './auth/Session';
import { useSession } from './auth/useSession';
import { LoginScreen } from './auth/LoginScreen';
import { SessionExpiry } from './auth/SessionExpiry';
import { NoPermissionsScreen } from './auth/NoPermissionsScreen';
import { ROLE_TEXT, can, describeWho } from './auth/roles';
import { OverviewScreen } from './screens/OverviewScreen';
import { RealmsScreen } from './screens/RealmsScreen';
import { SubscribersScreen } from './screens/SubscribersScreen';
import { UsersScreen } from './screens/UsersScreen';
import { MeScreen } from './screens/MeScreen';
import { RegistrationsScreen } from './screens/RegistrationsScreen';
import { MediaScreen } from './screens/MediaScreen';
import { CallsScreen } from './screens/CallsScreen';
import { SecurityScreen, TlsScreen } from './screens/SecurityScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { Loading } from './components/Status';
import { pageOptions } from './softphone/page';

/**
 * The softphone is the only screen that is loaded on demand.
 *
 * It pulls in JsSIP, which is most of this bundle on its own, and it is a
 * diagnostic that most sessions never open.
 */
const SoftphoneScreen = lazy(async () => ({ default: (await import('./screens/SoftphoneScreen')).SoftphoneScreen }));

/**
 * A screen this login's roles do not allow says so, rather than rendering a
 * 403 on every panel. Reached by a link from before a role was taken away,
 * or by typing the address.
 */
function Require({ roles, held, children }: { roles: readonly Role[]; held: readonly Role[]; children: ReactNode }) {
  if (can(held, ...roles)) return <>{children}</>;
  const names = roles.map((role) => ROLE_TEXT[role].label).join(' or ');
  return (
    <section className="panel">
      <p className="error-message" role="alert">
        This needs the {names} role, and you do not have it. Ask somebody with the Manage users role
        to give it to you.
      </p>
    </section>
  );
}

/**
 * The application shell: a brand, the section bar, the section's own bar when
 * it has one, and whichever screen the route names, or the sign-in screen in
 * its place while there is no session.
 *
 * Every screen takes its `AdminApi` as a prop rather than reaching for a
 * module singleton. That is what lets a test render one screen against a
 * `FakeAdminApi` it controls.
 */
export default function App({ api, session, loginHint }: { api: AdminApi; session: Session; loginHint?: string }) {
  const location = useLocation();
  const { token, info, expiresAt, ended } = useSession(session);
  const roles = info?.roles ?? [];
  const signedIn = Boolean(token && info);
  const section = signedIn ? sectionNavFor(location.pathname, roles) : undefined;
  const guard = (needed: readonly Role[], element: ReactNode) => <Require roles={needed} held={roles}>{element}</Require>;
  // The SIP section root goes to the first screen in it this login may use.
  const sipHome = can(roles, 'manage-realms') ? routes.realms : can(roles, 'manage-realm-subscribers') ? routes.subscribers : routes.registrations;

  const logOut = () => {
    // End the session on the node as well as here. If the node cannot be
    // reached the token is still forgotten here, which is the half that matters
    // to whoever sits at this browser next.
    void api.logout().catch(() => undefined).finally(() => session.signOut());
  };

  return (
    <div className="app-shell">
      <img className="app-watermark" src={logoUrl} alt="" aria-hidden="true" />

      <header className="topbar">
        <Link className="brand-link" to={routes.home}>
          <img className="app-logo" src={logoUrl} alt="" aria-hidden="true" />
          <span className="brand-name">AthenaSIP</span>
        </Link>
        {signedIn && roles.length > 0 ? <SectionNav ariaLabel="Sections" items={visible(topNav, roles)} className="" /> : <span />}
        <div className="topbar-trailing">
          {signedIn && info && (
            <>
              <SessionExpiry expiresAt={expiresAt} />
              <Link className="session-who" to={routes.me}>{describeWho(info)}</Link>
              <button className="secondary-button" type="button" onClick={logOut}>Log out</button>
            </>
          )}
        </div>
      </header>

      {section && section.items.length > 0 && (
        <div className="section-nav-slot">
          <SectionNav ariaLabel={section.ariaLabel} items={section.items} className="section-subnav" />
        </div>
      )}

      <main>
        <div className="admin-screen">
          {!signedIn || !info ? (
            // In place of the screen that was asked for, so signing in lands
            // there and the address bar never changes.
            <LoginScreen api={api} session={session} ended={ended} hint={loginHint} />
          ) : roles.length === 0 && location.pathname !== routes.me ? (
            <NoPermissionsScreen info={info} />
          ) : (
            <Routes>
              <Route path={routes.home} element={<OverviewScreen api={api} />} />

              <Route path={routes.sip} element={<Navigate to={sipHome} replace />} />
              <Route path={routes.realms} element={guard(['manage-realms'], <RealmsScreen api={api} />)} />
              <Route path={routes.subscribers} element={guard(['manage-realm-subscribers'], <SubscribersScreen api={api} />)} />
              <Route path={routes.registrations} element={guard(['view-cluster-status'], <RegistrationsScreen api={api} />)} />

              <Route path={routes.calls} element={guard(['view-cluster-status'], <CallsScreen api={api} />)} />

              <Route path={routes.media} element={guard(['manage-realms', 'view-cluster-status'], <MediaScreen api={api} />)} />

              <Route path={routes.security} element={guard(['view-cluster-status'], <SecurityScreen api={api} />)} />
              <Route path={routes.securityTls} element={guard(['view-cluster-status'], <TlsScreen api={api} />)} />

              <Route path={routes.users} element={guard(['manage-admin-users'], <UsersScreen api={api} username={info.username} />)} />
              <Route path={routes.me} element={<MeScreen api={api} info={info} expiresAt={expiresAt} onPasswordChanged={() => session.signOut('Your password was changed. Sign in with the new one.')} />} />

              <Route path={routes.settings} element={<SettingsScreen />} />

              <Route path={routes.diagnostics} element={<DiagnosticsScreen />} />
              <Route
                path={routes.softphone}
                element={<Suspense fallback={<Loading />}><SoftphoneScreen api={api} options={pageOptions(location.search)} /></Suspense>}
              />

              {/* An unknown path says so, rather than rendering the front page. */}
              <Route path="*" element={<NotFoundScreen />} />
            </Routes>
          )}
        </div>
      </main>
    </div>
  );
}
