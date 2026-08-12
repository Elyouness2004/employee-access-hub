import type { ReactNode } from 'react';

/**
 * A live region that is ALWAYS in the DOM, with the banner mounted into it.
 *
 * The bug this exists to prevent: `{message ? <Alert live="polite"/> : null}`
 * inserts the `role="status"` node and its text in the same commit, and screen
 * readers routinely miss that — a live region has to be present *before*
 * content lands in it to be observed. Every async outcome in the app is exactly
 * that shape (a decision recorded, a threshold changed, an allocation adjusted),
 * and each of them is the only confirmation the user gets.
 *
 * The banner inside must be `live={false}`: two nested live regions announce the
 * same sentence twice, which the Phase 5 review already caught once.
 */
export interface AlertSlotProps {
  /** The banner, or `null` when there is nothing to announce. */
  children: ReactNode;
  /** `polite` (default, `role="status"`) or `assertive` (`role="alert"`). */
  live?: 'polite' | 'assertive';
  className?: string;
}

export function AlertSlot({ children, live = 'polite', className }: AlertSlotProps) {
  return (
    <div
      role={live === 'polite' ? 'status' : 'alert'}
      aria-live={live}
      {...(className ? { className } : {})}
    >
      {children}
    </div>
  );
}
