import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { env } from '@/config/env';
import { SessionExpiryWarning } from '@/features/auth';
import { NotificationBell } from '@/features/notifications';
import { useRoles } from '@/shared/auth';
import { AppHeader, AppSidebar, MobileNavigation, SkipLink } from '@/shared/components';
import { MEDIA, useMediaQuery } from '@/shared/hooks/use-media-query';
import { usePreference } from '@/shared/hooks/use-preference';
import { filterNavGroups } from '@/shared/lib/navigation';

import { NAV_GROUPS } from '../navigation/nav-config';

// Dev-only role switcher: the env.isDev guard is statically false in
// production builds, so the chunk is never emitted there.
const DevRoleSwitcher = env.isDev ? lazy(() => import('../dev/DevRoleSwitcher')) : null;

/**
 * The application shell: graphite sidebar (drawer <md · icon rail at md ·
 * collapsible ≥lg with persisted preference), 56px top bar, canvas content
 * region. One navigation model, role-filtered once, feeds every variant.
 */
export function AppShell() {
  const { roles } = useRoles();
  const groups = useMemo(() => filterNavGroups(NAV_GROUPS, roles), [roles]);

  const isLgUp = useMediaQuery(MEDIA.lgUp);
  const [collapsedPref, setCollapsedPref] = usePreference('sidebarCollapsed', false);
  const collapsed = isLgUp ? collapsedPref : true;

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <SkipLink targetId="main" />
      <AppSidebar
        groups={groups}
        collapsed={collapsed}
        onToggleCollapsed={isLgUp ? () => setCollapsedPref(!collapsedPref) : undefined}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AppHeader
          onOpenMobileNav={() => setMobileNavOpen(true)}
          mobileNavTriggerRef={mobileNavTriggerRef}
          notifications={<NotificationBell />}
          devControls={
            DevRoleSwitcher ? (
              <Suspense fallback={null}>
                <DevRoleSwitcher />
              </Suspense>
            ) : undefined
          }
        />
        {/* Pinned under the top bar so a scrolled-down reader still sees it;
            it raises `--sticky-offset` while mounted so `scroll-padding-top`
            keeps focused content clear of it (WCAG 2.4.11). */}
        <SessionExpiryWarning />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <MobileNavigation
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        groups={groups}
        returnFocusRef={mobileNavTriggerRef}
      />
    </div>
  );
}
