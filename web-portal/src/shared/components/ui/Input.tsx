import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Text entry. Heights are the two the design system allows — 36px default,
 * 32px compact — so a control never disagrees with the buttons beside it.
 *
 * The accessibility contract (visible label, `aria-describedby`, `aria-invalid`,
 * focus-first-invalid) is wired by `FormField`, not here: a primitive that
 * labels itself invites two labels.
 */

/**
 * The resting border is `--border-strong`, not `--border`: this is the boundary
 * of an interactive control, which WCAG 1.4.11 holds to 3:1 (`--border` is the
 * low-contrast rule that separates rows, and left a field indistinguishable
 * from the panel behind it at 1.2:1). Hover steps up to `--text-muted` so the
 * hover state is still visibly stronger than the resting one, and an INVALID
 * field borrows the danger TEXT colour — the state has to be perceivable, and
 * the tinted `--status-danger-border` is a badge hairline, not a control edge.
 *
 * `disabled:` keeps the quiet `--border`: 1.4.11 exempts inactive components,
 * and an inactive control that shouts is a worse lie than a quiet one.
 */
const CONTROL_BASE =
  'w-full rounded-md border bg-surface px-3 text-body text-ink-strong transition-colors duration-fast placeholder:text-ink-disabled hover:enabled:border-ink-muted disabled:cursor-default disabled:border-border disabled:bg-surface-2 disabled:text-ink-disabled';

export function controlClasses(invalid?: boolean, compact?: boolean): string {
  return cn(
    CONTROL_BASE,
    invalid ? 'border-status-danger-text' : 'border-border-strong',
    compact ? 'h-8 max-md:h-11' : 'h-9 max-md:h-11',
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  compact?: boolean;
  /** Machine data (matricules, ids, amounts pasted from elsewhere) reads mono. */
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, compact, mono, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClasses(invalid, compact), mono && 'font-mono text-mono', className)}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        'h-auto py-2',
        invalid ? 'border-status-danger-border' : 'border-border',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
