import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { NavGroups } from '@/shared/components/NavGroups';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui';
import { cn } from '@/shared/lib/cn';
import type { NavGroup } from '@/shared/lib/navigation';

/**
 * The graphite control rail (DESIGN-SYSTEM §4.2): 256px expanded, 64px icon
 * rail. Hidden below md (the drawer takes over); forced to the rail at md;
 * user-collapsible ≥lg with persisted state. Focus rings re-map to a light
 * token on this dark surface (`on-dark-rail`).
 */
export interface AppSidebarProps {
  groups: readonly NavGroup[];
  collapsed: boolean;
  /** Present only when the viewport allows collapsing (≥lg). */
  onToggleCollapsed?: () => void;
  className?: string;
}

export function AppSidebar({ groups, collapsed, onToggleCollapsed, className }: AppSidebarProps) {
  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  return (
    <aside
      className={cn(
        'on-dark-rail sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar-surface md:flex',
        collapsed ? 'w-16' : 'w-64',
        className,
      )}
    >
      <div className={cn('flex h-14 shrink-0 items-center', collapsed ? 'justify-center' : 'px-4')}>
        {collapsed ? (
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 select-none items-center justify-center rounded-md bg-sidebar-active text-caption font-semibold text-sidebar-text-strong"
          >
            EA
          </span>
        ) : (
          <span className="select-none text-panel-title text-sidebar-text-strong">
            Employee Access Hub
          </span>
        )}
      </div>

      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto">
        <NavGroups groups={groups} collapsed={collapsed} />
      </nav>

      {onToggleCollapsed ? (
        <div className={cn('flex shrink-0 py-3', collapsed ? 'justify-center' : 'px-4')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label={toggleLabel}
                aria-expanded={!collapsed}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sidebar-text transition-colors duration-fast hover:bg-sidebar-hover hover:text-sidebar-text-strong"
              >
                {collapsed ? (
                  <PanelLeftOpen aria-hidden="true" className="size-5" />
                ) : (
                  <PanelLeftClose aria-hidden="true" className="size-5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{toggleLabel}</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </aside>
  );
}
