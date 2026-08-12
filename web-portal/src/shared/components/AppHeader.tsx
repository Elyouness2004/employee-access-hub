import { Menu } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

import { Breadcrumbs } from '@/shared/components/Breadcrumbs';
import { NotificationTrigger } from '@/shared/components/NotificationTrigger';
import { UserMenu } from '@/shared/components/UserMenu';
import { IconButton } from '@/shared/components/ui';

/**
 * Restrained top bar (56px, `--surface`, bottom border): breadcrumb trail and
 * the global area (bell, user menu). Below md it condenses to
 * hamburger · product name · bell · avatar.
 */
export interface AppHeaderProps {
  onOpenMobileNav: () => void;
  /** Receives the hamburger so the closing nav drawer can restore focus to it. */
  mobileNavTriggerRef?: Ref<HTMLButtonElement>;
  /** Dev-only controls injected by the app layer (e.g. the role switcher). */
  devControls?: ReactNode;
  /**
   * The live notification bell, injected by the app layer.
   *
   * The count comes from `GET /api/hr/notifications/count`, which belongs to
   * the `notifications` feature — and `shared/*` may never import a feature
   * (FRONTEND-ARCHITECTURE §14). So the shell takes it as a slot and `app/`
   * composes it, exactly as it already does for the dev controls. The
   * countless link below is the fallback: a bell that navigates, with no
   * number rather than a made-up one.
   */
  notifications?: ReactNode;
}

export function AppHeader({
  onOpenMobileNav,
  mobileNavTriggerRef,
  devControls,
  notifications,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-4 md:px-5 lg:px-6">
      <IconButton
        ref={mobileNavTriggerRef}
        label="Open navigation"
        className="md:hidden"
        withTooltip={false}
        onClick={onOpenMobileNav}
      >
        <Menu aria-hidden="true" />
      </IconButton>
      <span className="select-none text-panel-title text-ink-strong md:hidden">
        Employee Access Hub
      </span>
      <div className="hidden min-w-0 flex-1 md:block">
        <Breadcrumbs />
      </div>
      <div className="ml-auto flex items-center gap-1">
        {devControls}
        {notifications ?? <NotificationTrigger />}
        <UserMenu />
      </div>
    </header>
  );
}
