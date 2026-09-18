import { Suspense, lazy } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { AdminApi } from './api/AdminApi';
import { SectionNav } from './components/SectionNav';
import { sectionNavFor, topNav } from './app/navigation';
import { routes } from './app/routes';
import logoUrl from './assets/athenasip_small_white.svg?url';
import { OverviewScreen } from './screens/OverviewScreen';
import { RealmsScreen } from './screens/RealmsScreen';
import { SubscribersScreen } from './screens/SubscribersScreen';
import { RegistrationsScreen } from './screens/RegistrationsScreen';
import { MediaScreen } from './screens/MediaScreen';
import { RtpRelayScreen } from './screens/RtpRelayScreen';
import { SecurityScreen, TlsScreen } from './screens/SecurityScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { Loading } from './components/Status';

/**
 * The softphone is the only screen that is loaded on demand.
 *
 * It pulls in JsSIP, which is most of this bundle on its own, and it is a
 * diagnostic that most sessions never open. Everything else is provisioning
 * and is wanted immediately, so splitting further would buy a slower first
 * click rather than a faster load.
 */
const SoftphoneScreen = lazy(async () => ({ default: (await import('./screens/SoftphoneScreen')).SoftphoneScreen }));

/**
 * The application shell: a brand, the section bar, the section's own bar when
 * it has one, and whichever screen the route names.
 *
 * Every screen takes its `AdminApi` as a prop rather than reaching for a
 * module singleton. That is what lets a test render one screen against a
 * `FakeAdminApi` it controls, and it is why there is no context here doing the
 * same job less visibly.
 */
export default function App({ api }: { api: AdminApi }) {
  const location = useLocation();
  const section = sectionNavFor(location.pathname);

  return (
    <div className="app-shell">
      <img className="app-watermark" src={logoUrl} alt="" aria-hidden="true" />

      <header className="topbar">
        <Link className="brand-link" to={routes.home}>
          <img className="app-logo" src={logoUrl} alt="" aria-hidden="true" />
          <span className="brand-name">AthenaSIP</span>
        </Link>
        <SectionNav ariaLabel="Sections" items={topNav} className="" />
        <div className="topbar-trailing">
          <Link className="secondary-button" to={routes.settings}>Settings</Link>
        </div>
      </header>

      {section && (
        <div className="section-nav-slot">
          <SectionNav ariaLabel={section.ariaLabel} items={section.items} className="section-subnav" />
        </div>
      )}

      <main>
        <div className="admin-screen">
          <Routes>
            <Route path={routes.home} element={<OverviewScreen api={api} />} />

            {/* The SIP section root is a destination in the navigation, so it
                has to resolve to something. It redirects rather than
                duplicating Realms, so there is one URL per screen. */}
            <Route path={routes.sip} element={<Navigate to={routes.realms} replace />} />
            <Route path={routes.realms} element={<RealmsScreen api={api} />} />
            <Route path={routes.subscribers} element={<SubscribersScreen api={api} />} />
            <Route path={routes.registrations} element={<RegistrationsScreen api={api} />} />

            <Route path={routes.media} element={<MediaScreen api={api} />} />
            <Route path={routes.rtpRelay} element={<RtpRelayScreen api={api} />} />

            <Route path={routes.security} element={<SecurityScreen api={api} />} />
            <Route path={routes.securityTls} element={<TlsScreen api={api} />} />

            <Route path={routes.settings} element={<SettingsScreen />} />

            <Route path={routes.diagnostics} element={<DiagnosticsScreen />} />
            <Route path={routes.softphone} element={<Suspense fallback={<Loading />}><SoftphoneScreen /></Suspense>} />

            {/* An unknown path says so. The previous router silently rendered
                Home, so a mistyped URL and the front page were the same page. */}
            <Route path="*" element={<NotFoundScreen />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
