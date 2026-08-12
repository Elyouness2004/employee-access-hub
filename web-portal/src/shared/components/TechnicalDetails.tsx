import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * The disclosure that holds machine data: event ids, resource references,
 * correlation ids, exception names, HTTP statuses.
 *
 * The information is genuinely useful — an administrator investigating a failed
 * onboarding needs the exception and the correlation id, and removing them would
 * make the platform harder to operate, not cleaner. What it must not do is
 * arrive FIRST: a UUID rendered at the same weight as the person it refers to
 * makes an operator read the identifier and skip the fact.
 *
 * Native `<details>`/`<summary>`, following the same reasoning as the employee
 * detail accordion: real disclosure semantics, keyboard operable, announced
 * correctly, and no hand-rolled ARIA.
 */
export interface TechnicalDetailsProps {
  children: ReactNode;
  /** Defaults to "Technical details". */
  label?: string;
  /** Open on first render — for a surface whose whole purpose is diagnosis. */
  defaultOpen?: boolean;
  className?: string;
}

export function TechnicalDetails({
  children,
  label = 'Technical details',
  defaultOpen = false,
  className,
}: TechnicalDetailsProps) {
  return (
    <details
      open={defaultOpen}
      className={cn('rounded-md border border-border bg-surface-2', className)}
    >
      <summary
        // `list-none` covers Blink and Gecko; WebKit needs the pseudo-element
        // or Safari draws its native triangle next to the chevron.
        className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-label text-ink [&::-webkit-details-marker]:hidden"
      >
        {label}
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
      </summary>
      <div className="border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}
