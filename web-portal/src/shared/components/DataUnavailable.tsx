import { CloudOff } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * THE "the source reported itself absent" panel (DESIGN-SYSTEM §9.4).
 *
 * This exists because of one specific hazard in the analytics contract: every
 * `*Summary.unavailable()` factory fills its counts with **zero**. Those zeros
 * are padding for an unreachable service, not measurements, and rendering them
 * would tell an HR manager the company has 0 employees. So `available: false`
 * gets a structurally different panel — dashed border, no figure anywhere —
 * that no reader can mistake for a number.
 *
 * It is also not an error state: nothing failed on this request. The dashboard
 * answered correctly and said one of its sources was out of reach, which is a
 * fact about the platform rather than about this page. There is therefore no
 * Retry inside the panel — refreshing the whole snapshot is the page's action,
 * not this panel's.
 */
export interface DataUnavailableProps {
  /** Which source is unreachable ("hr-service"). Names it so the message is actionable. */
  source: string;
  /** What cannot be shown as a result ("Workforce KPIs"). */
  title?: string;
  children?: ReactNode;
  className?: string;
}

export function DataUnavailable({ source, title, children, className }: DataUnavailableProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border border-dashed border-border bg-surface p-5',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-ink-muted">
        <CloudOff aria-hidden="true" className="size-5 shrink-0" />
        <p className="text-panel-title text-ink-strong">{title ?? 'Data unavailable'}</p>
      </div>
      <p className="text-body text-ink-muted">
        {source} is unreachable, so these figures could not be collected. Nothing here is zero — the
        numbers are simply not known right now.
      </p>
      {children ? <div className="mt-1 text-body-secondary text-ink-muted">{children}</div> : null}
    </div>
  );
}
