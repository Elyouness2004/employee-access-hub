import { FileQuestion } from 'lucide-react';
import { useParams } from 'react-router-dom';

import {
  Alert,
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
import { formatDate, formatDateTime, formatMoney } from '@/shared/lib/format';
import { PersonReference, usePeopleLookup } from '@/shared/people';

import { useExpenseQuery } from '../api/expenses-api';
import { CATEGORY_LABELS } from '../labels';

/**
 * P08 — Expense claim detail, including the TWO-STEP approval trail that makes
 * this page different from its leave counterpart.
 *
 * An above-threshold claim carries two decisions: `firstApproverKeycloakId` /
 * `firstApprovedAt` (the manager) and `decidedBy` / `decidedAt` (the HR/Admin
 * sign-off). The page renders them as separate steps, and while the second is
 * outstanding it says so plainly — a claim in `PENDING_SECOND_APPROVAL` has been
 * approved once and can still be rejected, which is exactly the state people
 * misread as "approved".
 */
export function ExpenseDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const query = useExpenseQuery(id);
  // Three people can appear on a claim — the claimant, the first approver and
  // the second-level signatory — and expense-service stores all three as
  // Keycloak subjects (§2.5). One resolve covers the page.
  const people = usePeopleLookup({
    keycloakIds: [
      query.data?.employeeKeycloakId,
      query.data?.firstApproverKeycloakId,
      query.data?.decidedBy,
    ],
  });

  if (query.isPending) {
    return (
      <PageContainer>
        <PageHeader title="Expense claim" />
        <div aria-busy="true" className="rounded-lg border border-border bg-surface p-5">
          <VisuallyHidden>Loading the expense claim</VisuallyHidden>
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
        <PageHeader title="Expense claim" />
        <QueryStateBoundary
          error={query.error}
          onRetry={() => void query.refetch()}
          notFound={
            <EmptyState
              icon={FileQuestion}
              title="This expense claim does not exist"
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

  const claim = query.data;
  const awaitingSecond = claim.status === 'PENDING_SECOND_APPROVAL';

  const items: DetailItem[] = [
    {
      label: 'Claimed by',
      value: (
        <PersonReference
          resolution={people.byKeycloakId(claim.employeeKeycloakId)}
          fallback={claim.employeeKeycloakId}
          showEmail
        />
      ),
    },
    { label: 'Amount', value: formatMoney(claim.amount, claim.currency) },
    { label: 'Category', value: CATEGORY_LABELS[claim.category] ?? claim.category },
    { label: 'Date of expense', value: formatDate(claim.expenseDate) },
    { label: 'Status', value: <StatusBadge status={claim.status} /> },
    { label: 'Submitted', value: formatDateTime(claim.createdAt), mono: true },
    {
      label: 'Decision route',
      value: claim.hrEscalated
        ? 'Escalated to HR — no manager was available to decide it'
        : 'The claimant’s direct manager',
    },
    ...(claim.description ? [{ label: 'Description', value: claim.description, wide: true }] : []),
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Expense claim"
        description={`${formatMoney(claim.amount, claim.currency)} · ${formatDate(claim.expenseDate)}`}
      />

      <div className="flex flex-col gap-8">
        {awaitingSecond ? (
          <Alert tone="warning" title="Approved once — awaiting a second approval">
            This claim is above the company threshold, so it needs a second approval from HR before
            it is finalised. It has not been rejected, and it is not yet approved.
          </Alert>
        ) : null}

        <section aria-labelledby="claim-title">
          <h2 id="claim-title" className="mb-4 text-section-title text-ink-strong">
            Claim
          </h2>
          <div className="rounded-lg border border-border bg-surface p-5">
            <DetailList items={items} />
          </div>
        </section>

        <section aria-labelledby="approval-title">
          <h2 id="approval-title" className="mb-4 text-section-title text-ink-strong">
            Approval trail
          </h2>
          <ol className="flex flex-col gap-3">
            <TrailStep
              index={1}
              title="First approval"
              done={Boolean(claim.firstApprovedAt)}
              detail={
                claim.firstApprovedAt ? (
                  <DetailList
                    items={[
                      {
                        label: 'Approved',
                        value: formatDateTime(claim.firstApprovedAt),
                        mono: true,
                      },
                      ...(claim.firstApproverKeycloakId
                        ? [
                            {
                              label: 'Approver',
                              value: (
                                <PersonReference
                                  resolution={people.byKeycloakId(claim.firstApproverKeycloakId)}
                                  fallback={claim.firstApproverKeycloakId}
                                  showEmail
                                />
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                ) : claim.status === 'REJECTED' ? (
                  'Rejected at the first level.'
                ) : claim.status === 'CANCELLED' ? (
                  'Withdrawn before anyone decided it.'
                ) : (
                  'Waiting for the claimant’s manager.'
                )
              }
            />
            {claim.secondApprovalRequired || claim.status === 'PENDING_SECOND_APPROVAL' ? (
              <TrailStep
                index={2}
                title="Second approval (HR)"
                done={claim.status === 'APPROVED'}
                detail={
                  claim.status === 'APPROVED' && claim.decidedAt ? (
                    <DetailList
                      items={[
                        { label: 'Signed off', value: formatDateTime(claim.decidedAt), mono: true },
                        ...(claim.decidedBy
                          ? [
                              {
                                label: 'Approver',
                                value: (
                                  <PersonReference
                                    resolution={people.byKeycloakId(claim.decidedBy)}
                                    fallback={claim.decidedBy}
                                    showEmail
                                  />
                                ),
                              },
                            ]
                          : []),
                      ]}
                    />
                  ) : claim.status === 'REJECTED' ? (
                    'Rejected at the second level.'
                  ) : (
                    'Required because the amount is above the company threshold. HR has not signed it off yet.'
                  )
                }
              />
            ) : null}
            {claim.decisionComment ? (
              <li className="rounded-lg border border-border bg-surface p-5">
                <p className="text-caption text-ink-muted">Decision comment</p>
                <p className="mt-0.5 text-body text-ink-strong">{claim.decisionComment}</p>
              </li>
            ) : null}
          </ol>
        </section>

        {/*
          Kept, but below what a person came to read: a claim referenced in a
          support ticket needs its identifiers, and nobody reading the claim
          itself does (DESIGN-SYSTEM §12).
        */}
        <TechnicalDetails>
          <DetailList
            items={[
              { label: 'Claim id', value: claim.id, mono: true },
              { label: 'Employee id (HR record)', value: claim.employeeId, mono: true },
              {
                label: 'Claimant account (Keycloak subject)',
                value: claim.employeeKeycloakId,
                mono: true,
              },
              {
                label: 'Addressed manager account',
                value: claim.managerKeycloakId ?? 'None recorded',
                mono: Boolean(claim.managerKeycloakId),
              },
              ...(claim.firstApproverKeycloakId
                ? [
                    {
                      label: 'First approver (Keycloak subject)',
                      value: claim.firstApproverKeycloakId,
                      mono: true,
                    },
                  ]
                : []),
              ...(claim.decidedBy
                ? [{ label: 'Decided by (Keycloak subject)', value: claim.decidedBy, mono: true }]
                : []),
            ]}
          />
        </TechnicalDetails>
      </div>
    </PageContainer>
  );
}

function TrailStep({
  index,
  title,
  done,
  detail,
}: {
  index: number;
  title: string;
  done: boolean;
  detail: React.ReactNode;
}) {
  return (
    <li className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={
            done
              ? 'inline-flex size-6 items-center justify-center rounded-full bg-status-success-bg text-caption font-medium text-status-success-text'
              : 'inline-flex size-6 items-center justify-center rounded-full bg-surface-2 text-caption font-medium text-ink-muted'
          }
        >
          {index}
        </span>
        <h3 className="text-panel-title text-ink-strong">{title}</h3>
      </div>
      <div className="mt-3 text-body text-ink-muted">{detail}</div>
    </li>
  );
}
