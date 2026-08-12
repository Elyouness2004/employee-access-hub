import type { ReactNode } from 'react';

/**
 * One per page: the page's single <h1>, an optional one-line description, and
 * right-aligned actions (one primary button per page maximum — caller's
 * contract). Actions wrap below the title on narrow screens.
 */
export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-page-title text-ink-strong">{title}</h1>
        {description ? <p className="mt-1 text-body text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
