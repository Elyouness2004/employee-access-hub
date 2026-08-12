import { X } from 'lucide-react';
import type { RefObject } from 'react';

import { NavGroups } from '@/shared/components/NavGroups';
import {
  IconButton,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/shared/components/ui';
import type { NavGroup } from '@/shared/lib/navigation';

/**
 * Off-canvas navigation drawer (<md). Same navigation model and graphite
 * language as the sidebar; Radix Dialog supplies focus trap, Escape handling,
 * and focus restoration to the hamburger trigger.
 */
export interface MobileNavigationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly NavGroup[];
  /**
   * The hamburger that opened the drawer. The drawer is controlled (no Radix
   * trigger), so focus restoration on close is wired explicitly (WCAG 2.4.3).
   */
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}

export function MobileNavigation({
  open,
  onOpenChange,
  groups,
  returnFocusRef,
}: MobileNavigationProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="on-dark-rail border-r-0 bg-sidebar-surface"
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current) {
            event.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Primary navigation</SheetDescription>
        <div className="flex h-14 shrink-0 items-center justify-between pl-4 pr-2">
          <span className="select-none text-panel-title text-sidebar-text-strong">
            Employee Access Hub
          </span>
          <SheetClose asChild>
            <IconButton
              label="Close navigation"
              withTooltip={false}
              className="text-sidebar-text hover:enabled:bg-sidebar-hover hover:enabled:text-sidebar-text-strong"
            >
              <X aria-hidden="true" />
            </IconButton>
          </SheetClose>
        </div>
        <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto">
          <NavGroups groups={groups} onNavigate={() => onOpenChange(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
