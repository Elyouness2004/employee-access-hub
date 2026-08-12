import { NavLink } from 'react-router-dom';

import { Separator, Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui';
import { cn } from '@/shared/lib/cn';
import type { NavGroup } from '@/shared/lib/navigation';

/**
 * The single rendering of the navigation model — consumed by the desktop
 * sidebar (expanded and icon-rail) and the mobile drawer, so the two can never
 * drift. Expects ALREADY role-filtered groups (unauthorized items are omitted
 * upstream, never disabled).
 */
export interface NavGroupsProps {
  groups: readonly NavGroup[];
  /** Icon-rail mode: labels collapse into tooltips. */
  collapsed?: boolean;
  /** Called after activating a link (the mobile drawer closes itself). */
  onNavigate?: () => void;
}

export function NavGroups({ groups, collapsed = false, onNavigate }: NavGroupsProps) {
  return (
    <div className="flex flex-col gap-1 py-2">
      {groups.map((group, groupIndex) => (
        <section key={group.id} aria-label={group.label} className="flex flex-col">
          {groupIndex > 0 && collapsed ? (
            <Separator className="mx-3 my-2 w-auto bg-sidebar-hover" />
          ) : null}
          {group.label && !collapsed ? (
            // Visual label only — the <section aria-label> already names the
            // group; a heading here would put h3s before the page h1.
            <div
              aria-hidden="true"
              className="px-4 pb-1 pt-4 text-caption font-medium text-sidebar-text-muted"
            >
              {group.label}
            </div>
          ) : null}
          <ul className={cn('flex flex-col gap-0.5', collapsed ? 'items-center px-2' : 'px-2')}>
            {group.items.map((item) => {
              const link = (
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex h-9 items-center gap-3 rounded-md border-l-2 border-transparent text-label text-sidebar-text no-underline transition-colors duration-fast hover:bg-sidebar-hover hover:text-sidebar-text-strong max-md:h-11',
                      collapsed ? 'w-9 justify-center max-md:w-11' : 'w-full px-2',
                      isActive &&
                        'border-sidebar-text-strong bg-sidebar-active text-sidebar-text-strong',
                    )
                  }
                >
                  <item.icon aria-hidden="true" className="size-5 shrink-0" />
                  {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
                </NavLink>
              );

              return (
                <li key={item.to} className={collapsed ? undefined : 'w-full'}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
