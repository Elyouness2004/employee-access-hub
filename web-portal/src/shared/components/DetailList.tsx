import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Read-only label/value pairs as a real `<dl>` (accessibility rule: "`<dl>` for
 * detail lists"). Used for profiles, request details and decision trails.
 *
 * `mono` marks machine data — ids, matricules, correlation ids, claims — which
 * is a semantic choice, not a style one: if a value came from a machine and
 * will be pasted into a log query, it renders in IBM Plex Mono (§3).
 */
export interface DetailItem {
  label: string;
  value: ReactNode;
  /** Machine data: identifiers, codes, precise timestamps. */
  mono?: boolean;
  /** Span both columns for long prose (a reason, a decision comment). */
  wide?: boolean;
}

export interface DetailListProps {
  items: DetailItem[];
  className?: string;
}

export function DetailList({ items, className }: DetailListProps) {
  return (
    <dl className={cn('grid gap-x-8 gap-y-4 sm:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={item.label} className={cn('min-w-0', item.wide && 'sm:col-span-2')}>
          <dt className="text-caption text-ink-muted">{item.label}</dt>
          <dd
            className={cn(
              'mt-0.5 break-words text-ink-strong',
              item.mono ? 'font-mono text-mono' : 'text-body',
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
