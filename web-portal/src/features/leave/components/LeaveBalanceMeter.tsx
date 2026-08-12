import { CalendarRange } from 'lucide-react';

import { Skeleton, VisuallyHidden } from '@/shared/components/ui';
import { EmptyState, QueryStateBoundary } from '@/shared/components';
import { isUnlinkedIdentity } from '@/shared/api';
import type { LeaveBalanceResponse } from '@/shared/types/leave';

/**
 * The annual balance as a proportion bar plus the three figures the server
 * holds (`totalDays`, `usedDays`, `availableDays`).
 *
 * `role="meter"` with the value text spelled out, because the bar alone is a
 * shape: a screen reader gets "12 of 25 days used, 13 available" regardless of
 * whether the fill renders.
 *
 * An **unlinked identity is an empty state, not an error**: no employee record
 * is connected to this account yet. Rendering a red failure panel for a
 * legitimate onboarding state is exactly the dishonesty §9.4 exists to prevent.
 */
export interface LeaveBalanceMeterProps {
  balance: LeaveBalanceResponse | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void;
}

export function LeaveBalanceMeter({ balance, isLoading, error, onRetry }: LeaveBalanceMeterProps) {
  if (isLoading) {
    return (
      <div aria-busy="true" className="rounded-lg border border-border bg-surface p-5">
        <VisuallyHidden>Loading your leave balance</VisuallyHidden>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-4 h-2 w-full" />
      </div>
    );
  }

  if (error) {
    // leave-service answers 422 `Employee not eligible` for an unlinked
    // identity — never 404, because a linked employee's balance is
    // auto-provisioned on first read (`LeaveBalanceService.myBalance`).
    const unlinked = isUnlinkedIdentity(error);
    return unlinked ? (
      <EmptyState
        icon={CalendarRange}
        title="No leave balance yet"
        description="Your organization account is not linked to an HR record, so no allocation exists. HR sets this up during onboarding."
      />
    ) : (
      <QueryStateBoundary error={error} {...(onRetry ? { onRetry } : {})} />
    );
  }

  if (!balance) return null;

  const used = Math.min(balance.usedDays, balance.totalDays);
  const percentage = balance.totalDays > 0 ? Math.round((used / balance.totalDays) * 100) : 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-label text-ink-muted">Days available</p>
          <p className="text-display tabular-nums text-ink-strong">{balance.availableDays}</p>
        </div>
        <p className="text-body-secondary text-ink-muted">Annual allocation for {balance.year}</p>
      </div>

      <div
        role="meter"
        aria-label={`Annual leave used in ${balance.year}`}
        aria-valuenow={balance.usedDays}
        aria-valuemin={0}
        aria-valuemax={balance.totalDays}
        aria-valuetext={`${balance.usedDays} of ${balance.totalDays} days used, ${balance.availableDays} available`}
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          // Width is data, not decoration — it is the only inline style here and
          // it carries no colour.
          style={{ width: `${percentage}%` }}
          className="h-full rounded-full bg-action-primary"
        />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-4">
        <div>
          <dt className="text-caption text-ink-muted">Allocated</dt>
          <dd className="text-body tabular-nums text-ink-strong">{balance.totalDays}</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Used</dt>
          <dd className="text-body tabular-nums text-ink-strong">{balance.usedDays}</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Available</dt>
          <dd className="text-body tabular-nums text-ink-strong">{balance.availableDays}</dd>
        </div>
      </dl>
    </div>
  );
}
