import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Inline banner (DESIGN-SYSTEM §11.2) — the one way to state a condition that
 * applies to a region: a degraded dependency (503), a session about to expire,
 * a rule the user is about to hit.
 *
 * Tone carries meaning, never decoration, and never alone: each tone ships a
 * distinct icon and its own words, so the banner reads identically in
 * greyscale (§10, "status is never color alone").
 *
 * Announcement follows urgency rather than tone: polite is the default, and a
 * banner that is part of the page on load should stay polite so it does not
 * interrupt. See `live` for the case where the banner must not announce itself
 * at all.
 */

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<AlertTone, { className: string; icon: LucideIcon }> = {
  info: {
    className: 'border-status-info-border bg-status-info-bg text-status-info-text',
    icon: Info,
  },
  // Reserved for an operation that actually completed — never for a neutral
  // notice. `info` stays the default so success keeps its meaning (§2.4:
  // semantic color only where it carries one).
  success: {
    className: 'border-status-success-border bg-status-success-bg text-status-success-text',
    icon: CircleCheck,
  },
  warning: {
    className: 'border-status-warning-border bg-status-warning-bg text-status-warning-text',
    icon: TriangleAlert,
  },
  danger: {
    className: 'border-status-danger-border bg-status-danger-bg text-status-danger-text',
    icon: CircleAlert,
  },
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'role'> {
  tone?: AlertTone;
  /** Short headline; rendered as strong text, not a heading (banners nest anywhere). */
  title?: string;
  children?: ReactNode;
  /** Trailing controls (Retry, Continue session…). */
  actions?: ReactNode;
  /**
   * Live-region behavior: `polite` (default, `role="status"`), `assertive`
   * (`role="alert"`, only for something the user must act on now), or `false`
   * for no live region at all.
   *
   * `false` is the right choice when the banner contains a value that changes —
   * a countdown, a progress figure. Live regions are atomic, so every change
   * re-reads the whole banner; such a banner should carry one small live node
   * of its own instead.
   */
  live?: 'polite' | 'assertive' | false;
  className?: string;
}

const LIVE_ROLES = { polite: 'status', assertive: 'alert' } as const;

export function Alert({
  tone = 'info',
  title,
  children,
  actions,
  live = 'polite',
  className,
  ...rest
}: AlertProps) {
  const { className: toneClassName, icon: Icon } = TONES[tone];
  return (
    <div
      role={live === false ? undefined : LIVE_ROLES[live]}
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center',
        toneClassName,
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <div className="min-w-0 flex-1 text-ink">
        {title ? <p className="text-label text-ink-strong">{title}</p> : null}
        {children ? <div className={cn('text-body', title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
