import type { ReactNode } from 'react';

import { Skeleton, VisuallyHidden } from '@/shared/components/ui';

import { DataUnavailable } from './DataUnavailable';
import { QueryStateBoundary } from './QueryStateBoundary';

/**
 * The graceful-degradation contract of `/api/analytics/**`, applied in one
 * place (DESIGN-SYSTEM §11.3).
 *
 * Four outcomes that must never be collapsed into each other:
 *
 *  - **loading** — a value-shaped skeleton;
 *  - **error** — the request itself failed; routed through `QueryStateBoundary`
 *    so a 403 shows the server's wording and a 503 reads as "wait";
 *  - **unavailable** — the request SUCCEEDED and the section reported
 *    `available: false`. The counts in that payload are zeros written by
 *    `unavailable()`, so the children are not rendered at all: there is no
 *    version of this branch where a padding zero reaches the screen;
 *  - **available** — render the section, including any genuine zero, which is
 *    a measurement and therefore information.
 *
 * Every wrapped section decides independently, because the sources fail
 * independently — one unreachable service must not blank a page of otherwise
 * good data.
 */
export interface AvailabilityGuardProps {
  /** The section's own `available` flag. */
  available: boolean | undefined;
  /** Which downstream service backs this section ("leave-service"). */
  source: string;
  /** What the section shows, for the unavailable panel's heading. */
  title: string;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  children: ReactNode;
  className?: string;
}

export function AvailabilityGuard({
  available,
  source,
  title,
  isLoading,
  error,
  onRetry,
  children,
  className,
}: AvailabilityGuardProps) {
  if (error) {
    return (
      <QueryStateBoundary
        error={error}
        {...(onRetry ? { onRetry } : {})}
        {...(className ? { className } : {})}
      />
    );
  }
  if (isLoading || available === undefined) {
    return (
      <div aria-busy="true" className={className}>
        <VisuallyHidden>Loading {title}</VisuallyHidden>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!available) {
    return (
      <DataUnavailable
        source={source}
        title={`${title} unavailable`}
        {...(className ? { className } : {})}
      />
    );
  }
  return <>{children}</>;
}
