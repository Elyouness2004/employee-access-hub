import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { Link, useMatches } from 'react-router-dom';

/**
 * Hierarchy trail derived from route matches (`handle.crumb`). Entity-id →
 * name resolution (with mono UUID fallback) arrives with the data features.
 * Hidden below md — the condensed top bar shows logo · bell · avatar instead.
 */

interface CrumbHandle {
  crumb?: string;
}

export function Breadcrumbs() {
  const matches = useMatches().filter(
    (match) => typeof (match.handle as CrumbHandle | undefined)?.crumb === 'string',
  );

  if (matches.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-body-secondary text-ink-muted">
        {matches.map((match, index) => {
          const crumb = (match.handle as CrumbHandle).crumb as string;
          const isLast = index === matches.length - 1;
          return (
            <Fragment key={match.id}>
              {index > 0 ? (
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-disabled" />
              ) : null}
              <li className="min-w-0">
                {isLast ? (
                  <span aria-current="page" className="block truncate text-ink">
                    {crumb}
                  </span>
                ) : (
                  <Link
                    to={match.pathname}
                    className="block truncate rounded-sm text-ink-muted no-underline transition-colors duration-fast hover:text-ink"
                  >
                    {crumb}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
