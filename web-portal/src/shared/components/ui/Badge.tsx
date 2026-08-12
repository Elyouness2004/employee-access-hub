import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Generic label chip — NEUTRAL tone only. Domain statuses go through
 * `StatusBadge` (arrives with its first consumer) and the DESIGN-SYSTEM §2.4
 * mapping; this primitive never carries semantic color.
 */
export const Badge = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-caption font-medium text-ink',
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = 'Badge';
