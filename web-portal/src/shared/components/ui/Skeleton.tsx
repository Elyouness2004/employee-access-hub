import type { HTMLAttributes } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Loading placeholder shaped like the final content — pages compose these into
 * layout-shaped skeletons (never a full-page spinner). The CONTAINER being
 * loaded carries `aria-busy`, not each block. Shimmer collapses to a static
 * block under prefers-reduced-motion (globals.css).
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden="true" className={cn('skeleton-shimmer rounded-sm', className)} {...props} />
  );
}
