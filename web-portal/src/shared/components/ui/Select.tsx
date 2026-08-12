import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from '@/shared/lib/cn';

import { controlClasses } from './Input';

/**
 * Enum choice on the NATIVE `<select>`.
 *
 * Deliberate (Phase 3 decision, FRONTEND-ARCHITECTURE §14): the wrapped-Radix
 * rule covers dialogs, menus, tabs, tooltips and popovers — widgets whose ARIA
 * is genuinely hard. A select is not one of them. The platform control already
 * gives full keyboard entry, type-ahead, correct mobile pickers and screen-reader
 * support that no listbox re-implementation matches, at zero bundle cost. A
 * typeahead over large sets (the HR manager picker, Phase 4) is a different
 * component and will wrap Radix.
 *
 * It never auto-submits and never navigates on change — the caller owns that.
 */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  compact?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, compact, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          controlClasses(invalid, compact),
          // Room for the chevron; the native arrow is replaced so the control
          // matches every other one on the row.
          'appearance-none pr-8',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  ),
);
Select.displayName = 'Select';
