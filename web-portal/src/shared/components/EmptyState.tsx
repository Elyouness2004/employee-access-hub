import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * THE empty-state pattern (DESIGN-SYSTEM §9.4): 24px icon · one-line headline ·
 * one sentence · optional action. Distinct from ErrorState, which carries a
 * solid danger accent. Positive tone where emptiness is good.
 */
export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Sentence-length copy; a node so machine data can be rendered in mono. */
  description: ReactNode;
  action?: ReactNode;
  /** h1 for full-page states (404/403); h2 inside a page (default). */
  headingLevel?: 'h1' | 'h2';
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  headingLevel = 'h2',
  className,
}: EmptyStateProps) {
  const Heading = headingLevel;
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-6 text-ink-muted" />
      <Heading
        className={cn(
          'text-ink-strong',
          headingLevel === 'h1' ? 'text-page-title' : 'text-section-title',
        )}
      >
        {title}
      </Heading>
      <p className="text-body text-ink-muted">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
