import { FileQuestion } from 'lucide-react';
import { useParams } from 'react-router-dom';

import {
  DetailList,
  EmptyState,
  PageContainer,
  PageHeader,
  QueryStateBoundary,
  StatusBadge,
  TechnicalDetails,
  type DetailItem,
} from '@/shared/components';
import { Skeleton, VisuallyHidden } from '@/shared/components/ui';
import { formatDate, formatDateRange, formatDateTime, formatDays } from '@/shared/lib/format';
import { PersonReference, usePeopleLookup } from '@/shared/people';

import { useLeaveRequestQuery } from '../api/leave-api';
import { LEAVE_TYPE_LABELS } from '../labels';

/**
 * P06 — Leave request detail.
 *
 * `GET /api/leave/requests/{id}` is visible to the owner, the addressed manager,
 * HR and Admin. Anyone else gets **403, not 404** — the request exists, they
 * just cannot see it — and those two answers get different renders here:
 * `QueryStateBoundary` shows the server's 403 wording inline, and 404 gets an
 * honest "no such request" empty state rather than a failure panel.
 *
 * The decision trail renders exactly what the record holds. `businessDays` is
 * the server's number; an escalated request says so, because "escalated to HR"
 * explains why the manager named on the request is not the one who will decide.
 */
export function LeaveDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const query = useLeaveRequestQuery(id);
  // The leave service stores people as Keycloak subjects and holds no names
  // (§2.5) — the shared resolver is what turns them back into people. One
  // lookup for the whole page; it is a no-op until the request lands.
  const people = usePeopleLookup({
    keycloakIds: [query.data?.employeeKeycloakId, query.data?.decidedBy],
  });

  if (query.isPending) {
    return (
      <PageContainer>
        <PageHeader title="Leave request" />
        <div aria-busy="true" className="rounded-lg border border-border bg-surface p-5">
          <VisuallyHidden>Loading the leave request</VisuallyHidden>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-40" />
              </div>
            ))}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (query.error) {
    return (
      <PageContainer>
        <PageHeader title="Leave request" />
        <QueryStateBoundary
          error={query.error}
          onRetry={() => void query.refetch()}
          notFound={
            <EmptyState
              icon={FileQuestion}
              title="This leave request does not exist"
              description={
                <>
                  Nothing was found for id <span className="font-mono text-mono-sm">{id}</span>. It
                  may have been removed, or the link may be wrong.
                </>
              }
            />
          }
        />
      </PageContainer>
    );
  }

  const request = query.data;
  const decided = Boolean(request.decidedAt);

  const items: DetailItem[] = [
    {
      label: 'Requested by',
      value: (
        <PersonReference
          resolution={people.byKeycloakId(request.employeeKeycloakId)}
          fallback={request.employeeKeycloakId}
          showEmail
        />
      ),
    },
    { label: 'Type', value: LEAVE_TYPE_LABELS[request.type] ?? request.type },
    { label: 'Period', value: formatDateRange(request.startDate, request.endDate) },
    // The server counts these; the UI never recomputes them.
    { label: 'Working days', value: formatDays(request.businessDays) },
    { label: 'Status', value: <StatusBadge status={request.status} /> },
    { label: 'Submitted', value: formatDateTime(request.createdAt), mono: true },
    {
      label: 'Decision route',
      // Worded from the RECORD: the owner, the addressed manager, HR and Admin
      // can all read this page (`LeaveRequestService.get`).
      value: request.hrEscalated
        ? 'Escalated to HR — no manager was available to decide it'
        : 'The requester’s direct manager',
    },
    ...(request.reason ? [{ label: 'Reason', value: request.reason, wide: true }] : []),
  ];

  const decisionItems: DetailItem[] = decided
    ? [
        { label: 'Decided', value: formatDateTime(request.decidedAt), mono: true },
        ...(request.decidedBy
          ? [
              {
                label: 'Decided by',
                value: (
                  <PersonReference
                    resolution={people.byKeycloakId(request.decidedBy)}
                    fallback={request.decidedBy}
                    showEmail
                  />
                ),
              },
            ]
          : []),
        ...(request.decisionComment
          ? [{ label: 'Comment', value: request.decisionComment, wide: true }]
          : []),
      ]
    : [];

  return (
    <PageContainer>
      <PageHeader
        title="Leave request"
        description={`${formatDateRange(request.startDate, request.endDate)} · submitted ${formatDate(request.createdAt)}`}
      />

      <div className="flex flex-col gap-8">
        <section aria-labelledby="request-title">
          <h2 id="request-title" className="mb-4 text-section-title text-ink-strong">
            Request
          </h2>
          <div className="rounded-lg border border-border bg-surface p-5">
            <DetailList items={items} />
          </div>
        </section>

        <section aria-labelledby="decision-title">
          <h2 id="decision-title" className="mb-4 text-section-title text-ink-strong">
            Decision
          </h2>
          <div className="rounded-lg border border-border bg-surface p-5">
            {decided ? (
              <DetailList items={decisionItems} />
            ) : request.status === 'CANCELLED' ? (
              <p className="text-body text-ink-muted">Withdrawn before it was decided.</p>
            ) : (
              <p className="text-body text-ink-muted">
                Not decided yet. {request.hrEscalated ? 'HR' : 'The requester’s manager'} sees it in
                their approvals inbox.
              </p>
            )}
          </div>
        </section>

        {/*
          The identifiers stay reachable — a support ticket about this request
          needs them — but below the facts a person came here to read, not
          instead of them (DESIGN-SYSTEM §12).
        */}
        <TechnicalDetails>
          <DetailList
            items={[
              { label: 'Request id', value: request.id, mono: true },
              { label: 'Employee id (HR record)', value: request.employeeId, mono: true },
              {
                label: 'Requester account (Keycloak subject)',
                value: request.employeeKeycloakId,
                mono: true,
              },
              {
                label: 'Addressed manager account',
                value: request.managerKeycloakId ?? 'None recorded',
                mono: Boolean(request.managerKeycloakId),
              },
              ...(request.decidedBy
                ? [{ label: 'Decided by (Keycloak subject)', value: request.decidedBy, mono: true }]
                : []),
            ]}
          />
        </TechnicalDetails>
      </div>
    </PageContainer>
  );
}
