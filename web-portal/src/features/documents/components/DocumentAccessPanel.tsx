import { Building2, Lock, UserRound } from 'lucide-react';

import { useIdentity } from '@/shared/auth';
import { cn } from '@/shared/lib/cn';
import type { DocumentResponse } from '@/shared/types/documents';

/**
 * Why this document is reachable, in the platform's own terms (FR-41).
 *
 * The rule the backend applies has exactly two clauses, and both are stated
 * here rather than summarised into "you have access":
 *
 *  1. **the category role gate** — the caller's role must satisfy the
 *     category's `minRole`. HR/ADMIN categories are what "sensitive" means;
 *  2. **ownership** — the document is company-wide (`ownerKeycloakId: null`),
 *     or the caller owns it, or the caller is HR/ADMIN, who administer and read
 *     everything in their tier.
 *
 * Owner is compared as `sub` vs `ownerKeycloakId` — a Keycloak subject against
 * a Keycloak subject. Comparing it to an `employeeId` would be a correctness
 * bug that happens to render.
 */
export interface DocumentAccessPanelProps {
  document: DocumentResponse;
  className?: string;
}

export function DocumentAccessPanel({ document, className }: DocumentAccessPanelProps) {
  const identity = useIdentity();
  const isMine = document.ownerKeycloakId !== null && document.ownerKeycloakId === identity.subject;

  return (
    <div className={cn('flex flex-col gap-3 rounded-lg border border-border p-4', className)}>
      <p className="text-label text-ink-strong">Who can reach this document</p>

      <div className="flex items-start gap-2">
        {document.ownerKeycloakId === null ? (
          <Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        ) : (
          <UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        )}
        <p className="text-body-secondary text-ink">
          {document.ownerKeycloakId === null ? (
            <>
              <span className="text-ink-strong">Company-wide.</span> It belongs to no individual, so
              everyone whose role clears the category can read it.
            </>
          ) : isMine ? (
            <>
              <span className="text-ink-strong">Yours.</span> It is assigned to your account, and to
              the HR and admin tier who administer all documents.
            </>
          ) : (
            <>
              <span className="text-ink-strong">Assigned to one person.</span> Only that account and
              the HR/admin tier can read it.
            </>
          )}
        </p>
      </div>

      <div className="flex items-start gap-2">
        {document.sensitive ? (
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-warning-text" />
        ) : (
          <Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        )}
        <p className="text-body-secondary text-ink">
          Category <span className="text-ink-strong">{document.categoryName}</span>
          {document.sensitive ? (
            <>
              {' '}
              is <span className="text-ink-strong">sensitive</span> — its minimum role is HR or
              admin, so nobody below that tier sees these documents at all.
            </>
          ) : (
            <> sets the minimum role required to open anything filed under it.</>
          )}
        </p>
      </div>
    </div>
  );
}
