import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Skeleton, VisuallyHidden } from '@/shared/components/ui';
import { cn } from '@/shared/lib/cn';

import { QueryStateBoundary } from './QueryStateBoundary';

/**
 * A dashboard figure with the question it answers (DESIGN-SYSTEM §11.2).
 *
 * The design system forbids stat-card rows "without a business question behind
 * each stat", so `label` is the question and `hint` is the answer's context —
 * a card whose only content is a number is exactly what §12 rejects.
 *
 * Four states, kept apart because they mean different things (§9.4):
 *  - **loading** — a value-shaped skeleton, not a zero;
 *  - **error** — routed through `QueryStateBoundary`, so a 403 shows the
 *    server's wording, a 503 reads as "wait", and everything else carries its
 *    `detail` and correlation id. Collapsing all three into "Data unavailable"
 *    would throw away the only information that tells the user what to do;
 *  - **unavailable** — the analytics `available: false` payload. A SOURCE that
 *    reported itself absent, which is not the same as a request that failed —
 *    and never a zero;
 *  - **value** — including a real, measured zero, which is information.
 */
export interface StatCardProps {
  /** The question this figure answers ("Days available"). */
  label: string;
  value: ReactNode;
  /** One line of context: what the number is counted over. */
  hint?: ReactNode;
  icon?: LucideIcon;
  isLoading?: boolean;
  /** A failed request. Rendered by kind, with the server's own words. */
  error?: unknown;
  onRetry?: () => void;
  /** The source reported itself absent (analytics `available: false`). */
  unavailable?: boolean;
  /** Names the unreachable source, so the message is actionable. */
  unavailableReason?: string;
  action?: ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  isLoading,
  error,
  onRetry,
  unavailable,
  unavailableReason,
  action,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border bg-surface p-5',
        unavailable ? 'border-dashed border-border' : 'border-border',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {Icon ? <Icon aria-hidden="true" className="size-4 text-ink-muted" /> : null}
        <p className="text-label text-ink-muted">{label}</p>
      </div>
      {isLoading ? (
        <>
          <VisuallyHidden>Loading {label}</VisuallyHidden>
          <Skeleton className="mt-1 h-8 w-20" />
        </>
      ) : error ? (
        <QueryStateBoundary className="mt-1" error={error} {...(onRetry ? { onRetry } : {})} />
      ) : unavailable ? (
        <p className="mt-1 text-body text-ink-muted">
          Data unavailable
          {unavailableReason ? ` — ${unavailableReason}` : ''}
        </p>
      ) : (
        <p className="mt-1 text-display tabular-nums text-ink-strong">{value}</p>
      )}
      {hint && !isLoading && !error ? (
        <p className="text-body-secondary text-ink-muted">{hint}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
