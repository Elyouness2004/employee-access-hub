import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/shared/components/ui/Button';
import { cn } from '@/shared/lib/cn';

/**
 * THE error pattern (DESIGN-SYSTEM §9.4): the RFC 7807 `detail`, the mono
 * correlation id, and Retry where retrying is meaningful. Regional by default —
 * never whole-page unless the whole page truly failed.
 */
export interface ErrorStateProps {
  title?: string;
  /** User-safe message — RFC 7807 `detail` for API failures. */
  detail: string;
  correlationId?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Development-only diagnostics slot (stack traces); never user-facing copy. */
  diagnostics?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  detail,
  correlationId,
  onRetry,
  retryLabel = 'Retry',
  diagnostics,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('rounded-lg border border-status-danger-border bg-surface p-5', className)}>
      <div className="flex items-start gap-3">
        <TriangleAlert
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-status-danger-text"
        />
        <div className="min-w-0 flex-1">
          {/* The announced alert carries only the user-safe message — never
              diagnostics. */}
          <div role="alert">
            <p className="text-panel-title text-ink-strong">{title}</p>
            <p className="mt-1 text-body text-ink">{detail}</p>
            {correlationId ? (
              <p className="mt-2 font-mono text-mono-sm text-ink-muted">
                Correlation id: {correlationId}
              </p>
            ) : null}
          </div>
          {onRetry ? (
            <div className="mt-4">
              <Button variant="secondary" size="compact" onClick={onRetry}>
                {retryLabel}
              </Button>
            </div>
          ) : null}
          {diagnostics}
        </div>
      </div>
    </div>
  );
}
