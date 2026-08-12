import {
  ArrowUpFromLine,
  Ban,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Clock,
  Lock,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/shared/lib/cn';

/**
 * THE status vocabulary (DESIGN-SYSTEM §2.4), defined once and consumed
 * everywhere. Feature code never picks a badge colour.
 *
 * Two rules the map exists to enforce:
 *
 *  - **Colour never carries the meaning alone** — every entry pairs a tone with
 *    an icon and a label, so the badge reads identically in greyscale.
 *  - **`PENDING_SECOND_APPROVAL` is never "Approved."** It is a distinct amber
 *    state: a manager approved an above-threshold claim and HR/Admin has not
 *    signed it off yet (BR-03). It can still be rejected.
 *
 * Labels are sentence case for humans; the raw machine literal stays available
 * through `title` for anyone matching against logs.
 */

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusStyle {
  tone: StatusTone;
  label: string;
  icon: LucideIcon;
  /** Solid is reserved for the highest-severity states (§2.4). */
  solid?: boolean;
}

const TONE_SUBTLE: Record<StatusTone, string> = {
  success: 'border-status-success-border bg-status-success-bg text-status-success-text',
  warning: 'border-status-warning-border bg-status-warning-bg text-status-warning-text',
  danger: 'border-status-danger-border bg-status-danger-bg text-status-danger-text',
  info: 'border-status-info-border bg-status-info-bg text-status-info-text',
  neutral: 'border-status-neutral-border bg-status-neutral-bg text-status-neutral-text',
};

/**
 * Every domain status the SPA renders, from the backend enums:
 * `LeaveStatus`, `ExpenseStatus`, `EmployeeStatus`, `ProvisioningStatus`.
 */
export const STATUS_MAP: Record<string, StatusStyle> = {
  // Leave + expense lifecycle
  SUBMITTED: { tone: 'info', label: 'Submitted', icon: Clock },
  PENDING_SECOND_APPROVAL: {
    tone: 'warning',
    label: 'Pending second approval',
    icon: TriangleAlert,
  },
  APPROVED: { tone: 'success', label: 'Approved', icon: CircleCheck },
  REJECTED: { tone: 'danger', label: 'Rejected', icon: CircleSlash },
  CANCELLED: { tone: 'neutral', label: 'Cancelled', icon: Ban },
  // Employee lifecycle
  ACTIVE: { tone: 'success', label: 'Active', icon: CircleCheck },
  DISABLED: { tone: 'neutral', label: 'Disabled', icon: CircleSlash },
  TERMINATED: { tone: 'danger', label: 'Terminated', icon: Ban, solid: true },
  // Provisioning
  PROVISIONED: { tone: 'success', label: 'Provisioned', icon: CircleCheck },
  NOT_PROVISIONED: { tone: 'neutral', label: 'Not provisioned', icon: CircleDashed },
  FAILED: { tone: 'danger', label: 'Provisioning failed', icon: ShieldAlert },
  LOCKED: { tone: 'danger', label: 'Locked', icon: Lock, solid: true },
  /**
   * Not a backend enum: `hrEscalated: true` on a leave or expense record.
   * DESIGN-SYSTEM §2.4 gives it a badge of its own so the fact is stated once,
   * in the one status vocabulary, instead of being reworded per screen.
   */
  HR_ESCALATED: { tone: 'info', label: 'Escalated to HR', icon: ArrowUpFromLine },
  /** `SessionResponse.current` — the session this browser tab is using. */
  CURRENT_SESSION: { tone: 'success', label: 'This device', icon: ShieldCheck },
  /**
   * `DocumentResponse.sensitive` / `CategoryResponse.sensitive` — derived
   * server-side from the category's `minRole` being HR or ADMIN. DESIGN-SYSTEM
   * §2.4 gives it warning + a **lock icon** specifically so the marking is not
   * carried by colour alone.
   */
  SENSITIVE_DOCUMENT: { tone: 'warning', label: 'Sensitive', icon: Lock },
  /** Derived audit `result` — the trail's own SUCCESS/FAILURE verdict. */
  SUCCESS: { tone: 'success', label: 'Success', icon: CircleCheck },
  FAILURE: { tone: 'danger', label: 'Failure', icon: ShieldAlert },
};

const SOLID_TONE: Record<StatusTone, string> = {
  success: 'border-status-success-text bg-status-success-text text-surface',
  warning: 'border-status-warning-text bg-status-warning-text text-surface',
  danger: 'border-action-destructive bg-action-destructive text-action-destructive-text',
  info: 'border-status-info-text bg-status-info-text text-surface',
  neutral: 'border-status-neutral-text bg-status-neutral-text text-surface',
};

export interface StatusBadgeProps {
  /** A backend enum literal. Unknown values render neutral, verbatim, in mono. */
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_MAP[status];
  if (!style) {
    // An enum the SPA has not been taught: show the machine value rather than
    // guess a meaning or hide the row.
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-sm border border-status-neutral-border bg-status-neutral-bg px-1.5 py-0.5 font-mono text-mono-sm text-status-neutral-text',
          className,
        )}
      >
        {status}
      </span>
    );
  }
  const Icon = style.icon;
  return (
    <span
      title={status}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-caption font-medium',
        style.solid ? SOLID_TONE[style.tone] : TONE_SUBTLE[style.tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {style.label}
    </span>
  );
}

/** The human label for a status, for prose and `aria-label`s. */
export function statusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status;
}
