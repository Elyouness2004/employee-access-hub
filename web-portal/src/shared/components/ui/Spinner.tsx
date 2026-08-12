import { cn } from '@/shared/lib/cn';

import { VisuallyHidden } from './VisuallyHidden';

export interface SpinnerProps {
  /** 16 inside controls, 20 standalone (DESIGN-SYSTEM §11.1). */
  size?: 16 | 20;
  /** Announced to screen readers unless decorative. */
  label?: string;
  /**
   * Decorative spinners (inside a control that already announces busy, e.g. a
   * loading Button) render aria-hidden with no status role.
   */
  decorative?: boolean;
  className?: string;
}

/**
 * In-control loading indicator ONLY — never a full-page spinner
 * (loading pages use layout-shaped skeletons).
 */
export function Spinner({
  size = 16,
  label = 'Loading…',
  decorative = false,
  className,
}: SpinnerProps) {
  const glyph = (
    <svg
      className={cn('animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );

  if (decorative) return glyph;

  return (
    <span role="status" className="inline-flex">
      <VisuallyHidden>{label}</VisuallyHidden>
      {glyph}
    </span>
  );
}
