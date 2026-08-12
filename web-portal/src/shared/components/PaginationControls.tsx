import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/shared/components/ui';
import type { PageResponse } from '@/shared/api';

/**
 * Paging bound to the server envelope (`page`, `size`, `totalElements`,
 * `first`, `last`) — never to a client-side slice of a fully-loaded list.
 *
 * The range is stated in words rather than as bare page numbers because
 * "Showing 21–40 of 137" answers the question people actually have, and the
 * count is announced politely so a keyboard user knows the page moved.
 */
export interface PaginationControlsProps<T> {
  page: PageResponse<T>;
  onPageChange: (page: number) => void;
  /** Plural noun for the counted thing ("requests", "team members"). */
  label: string;
}

export function PaginationControls<T>({ page, onPageChange, label }: PaginationControlsProps<T>) {
  if (page.totalElements === 0) return null;

  const from = page.page * page.size + 1;
  const to = Math.min(from + page.content.length - 1, page.totalElements);
  const summary = `Showing ${from}–${to} of ${page.totalElements} ${label}`;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3"
    >
      {/* THE result-count announcement for a list. It lives here, not in the
          table, because this is the component that already knows the envelope —
          and two live regions describing the same change announce it twice. */}
      <p aria-live="polite" className="text-body-secondary text-ink-muted">
        {summary}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="compact"
          variant="secondary"
          disabled={page.first}
          onClick={() => onPageChange(page.page - 1)}
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <span className="text-body-secondary text-ink-muted">
          Page {page.page + 1} of {Math.max(page.totalPages, 1)}
        </span>
        <Button
          size="compact"
          variant="secondary"
          disabled={page.last}
          onClick={() => onPageChange(page.page + 1)}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
