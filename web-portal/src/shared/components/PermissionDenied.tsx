import { ShieldX } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

/**
 * The inline 403 panel (DESIGN-SYSTEM §9.4). An API denial is NOT a routing
 * problem: the user is signed in, reached a page they are allowed to open, and
 * one region inside it is out of their scope. Redirecting would lose the rest
 * of the page and imply they had gone somewhere they should not.
 *
 * The server's `detail` is the whole message and is rendered verbatim: a
 * layer-2 denial ("requires role HR") and a layer-3 one ("only the direct
 * manager may decide this request") are genuinely different facts, and the
 * wording is the only thing that distinguishes them.
 */
export interface PermissionDeniedProps {
  /** The RFC 7807 `detail` from the server. */
  detail: string;
  correlationId?: string;
  className?: string;
}

export function PermissionDenied({ detail, correlationId, className }: PermissionDeniedProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface-2 p-5', className)}>
      <div className="flex items-start gap-3">
        <ShieldX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-muted" />
        <div className="min-w-0">
          <p className="text-panel-title text-ink-strong">You do not have access to this</p>
          <p className="mt-1 text-body text-ink">{detail}</p>
          <p className="mt-2 text-body-secondary text-ink-muted">
            You are signed in — this is an authorization decision made by the server, not a sign-in
            problem.
          </p>
          {correlationId ? (
            <p className="mt-2 font-mono text-mono-sm text-ink-muted">
              Correlation id: {correlationId}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
