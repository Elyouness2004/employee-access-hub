import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, Pencil, UserX } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import {
  EmployeeFormDialog,
  EmployeeProfileHeader,
  EmployeeProfilePanel,
  employeeKeys,
  employeeName,
  useEmployeeQuery,
} from '@/features/employees';
import {
  EmployeeSessionsPanel,
  IdentityActionPanel,
  ProvisioningHistoryPanel,
  SecurityEventsPanel,
  useProvisioningHistoryQuery,
} from '@/features/identity';
import { EmptyState, PageContainer, PageHeader, QueryStateBoundary } from '@/shared/components';
import {
  Button,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  VisuallyHidden,
} from '@/shared/components/ui';
import { MEDIA, useMediaQuery } from '@/shared/hooks/use-media-query';
import { cn } from '@/shared/lib/cn';
import type { EmployeeResponse, ProvisioningHistoryResponse } from '@/shared/types/hr';

/**
 * P17 — Employee detail (`/hr/employees/:id`). HR + ADMIN.
 *
 * The page lives in `app/` because it composes two features that may not import
 * each other (FRONTEND-ARCHITECTURE §14): `employees` owns the HR record and its
 * form, `identity` owns `/api/hr/admin/**` — the actions, the journals and the
 * session view. Folding either into the other would give one endpoint two cache
 * keys and two invalidation rules, which is how a record ends up looking
 * provisioned on one tab and not on another.
 *
 * The provisioning journal is fetched HERE rather than only inside its own tab,
 * because two tabs need it: the history tab renders it, and the identity tab
 * reads its last row to decide between "Provision" and "Retry provisioning" and
 * to state what last happened. One query, one cache entry, no divergence.
 *
 * The open tab lives in the URL so a link can point at the identity tab — which
 * is exactly what the directory does after creating an employee whose
 * provisioning may have failed silently.
 */

const TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'identity', label: 'Identity' },
  { value: 'provisioning', label: 'Provisioning history' },
  { value: 'security', label: 'Security events' },
  { value: 'sessions', label: 'Sessions' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

function isTabValue(value: string | null): value is TabValue {
  return TABS.some((tab) => tab.value === value);
}

export function EmployeeDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabValue = isTabValue(requested) ? requested : 'profile';

  const employee = useEmployeeQuery(id, { enabled: Boolean(id) });
  // Shared between the identity tab (which reads the last row) and the history
  // tab (which renders all of them).
  const history = useProvisioningHistoryQuery(id, { enabled: Boolean(id) });

  const [editOpen, setEditOpen] = useState(false);
  const isCompact = !useMediaQuery(MEDIA.mdUp);

  const selectTab = useCallback(
    (value: string) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('tab', value);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // An identity action can change the HR record (`disable` → DISABLED,
  // provisioning → linked account, offboarding → TERMINATED). The two features
  // may not import each other, so this page — which already owns both — is the
  // one place that knows to refresh the record after one runs.
  const queryClient = useQueryClient();
  const refreshEmployeeRecord = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: employeeKeys.all });
  }, [queryClient]);

  if (employee.isPending) {
    return (
      <PageContainer>
        <PageHeader title="Employee" description="Loading the employee record." />
        {/*
          Shaped like what arrives — the profile header, the section strip, then
          a two-column detail list — rather than a table skeleton over a page
          that has no table (DESIGN-SYSTEM §9.4).
        */}
        <div aria-busy="true" className="flex flex-col gap-6">
          <VisuallyHidden>Loading the employee record</VisuallyHidden>
          <div className="flex items-start gap-4 rounded-lg border border-border bg-surface p-5">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex w-full max-w-content flex-col gap-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-40" />
            </div>
          </div>
          <div className="flex gap-4 border-b border-border pb-2">
            {TABS.map((entry) => (
              <Skeleton key={entry.value} className="h-5 w-24" />
            ))}
          </div>
          <div className="rounded-lg border border-border bg-surface p-5">
            <Skeleton className="h-5 w-40" />
            <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (employee.error || !employee.data) {
    return (
      <PageContainer>
        <PageHeader title="Employee" />
        <QueryStateBoundary
          error={employee.error}
          onRetry={() => void employee.refetch()}
          notFound={
            <EmptyState
              icon={UserX}
              title="No such employee"
              description="This record does not exist, or it has been deleted since the link was made."
              action={
                <Button asChild variant="secondary">
                  <Link to="/hr/employees">Back to the directory</Link>
                </Button>
              }
            />
          }
        />
      </PageContainer>
    );
  }

  const record = employee.data;
  const name = employeeName(record);

  return (
    <PageContainer>
      <PageHeader
        title={name}
        description="The HR record and everything the platform knows about this person’s login account."
        actions={
          <>
            <Button asChild variant="ghost">
              <Link to="/hr/employees">
                <ArrowLeft aria-hidden="true" />
                Directory
              </Link>
            </Button>
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden="true" />
              Edit record
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <EmployeeProfileHeader employee={record} />

        {isCompact ? (
          /*
            Below `md` the five sections become an accordion
            (FRONTEND-SPECIFICATION §7, DESIGN-SYSTEM §11.2). Five labels in a
            row do not fit a 375px viewport, and the alternative — a tab strip
            that scrolls sideways — is what §7 forbids outright.

            Native <details>/<summary>: real disclosure semantics, keyboard
            operable, announced correctly, and no hand-rolled ARIA (Radix ships
            no accordion in this app's wrapped set). Only the open section's
            content is rendered, so a closed panel fires no query — the same
            behaviour Radix Tabs gives above `md`.
          */
          <section aria-label="Employee detail sections" className="flex flex-col gap-2">
            {TABS.map((entry) => {
              const isOpen = tab === entry.value;
              return (
                <details
                  key={entry.value}
                  open={isOpen}
                  className="rounded-lg border border-border bg-surface"
                >
                  <summary
                    // `list-none` covers Blink and Gecko; WebKit needs the
                    // pseudo-element, or Safari draws its native triangle next
                    // to the chevron. Mobile Safari is a first-class target for
                    // a layout that only exists below `md`.
                    className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-label text-ink-strong [&::-webkit-details-marker]:hidden"
                    onClick={(event) => {
                      // Selection is URL state, so the browser's own toggle is
                      // replaced by setting the section — which keeps the
                      // accordion single-open and the link shareable.
                      event.preventDefault();
                      selectTab(entry.value);
                    }}
                  >
                    {entry.label}
                    <ChevronDown
                      aria-hidden="true"
                      className={cn('size-5 shrink-0 text-ink-muted', isOpen && 'rotate-180')}
                    />
                  </summary>
                  {isOpen ? (
                    <div className="border-t border-border p-4">
                      <SectionContent
                        section={entry.value}
                        record={record}
                        history={history}
                        onIdentityChanged={refreshEmployeeRecord}
                      />
                    </div>
                  ) : null}
                </details>
              );
            })}
          </section>
        ) : (
          <Tabs value={tab} onValueChange={selectTab}>
            <TabsList aria-label="Employee detail sections">
              {TABS.map((entry) => (
                <TabsTrigger key={entry.value} value={entry.value}>
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {TABS.map((entry) => (
              <TabsContent key={entry.value} value={entry.value}>
                <SectionContent
                  section={entry.value}
                  record={record}
                  history={history}
                  onIdentityChanged={refreshEmployeeRecord}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>

      <EmployeeFormDialog open={editOpen} onOpenChange={setEditOpen} employee={record} />
    </PageContainer>
  );
}

/**
 * One section's content, rendered by the tab strip above `md` and by the
 * accordion below it. Defined once so the two layouts cannot drift into showing
 * different things — the responsive decision is about presentation only.
 */
function SectionContent({
  section,
  record,
  history,
  onIdentityChanged,
}: {
  section: TabValue;
  record: EmployeeResponse;
  history: UseQueryResult<ProvisioningHistoryResponse[]>;
  onIdentityChanged: () => void;
}) {
  switch (section) {
    case 'profile':
      return <EmployeeProfilePanel employee={record} />;
    case 'identity':
      return (
        <IdentityActionPanel
          employee={record}
          history={history.data}
          isHistoryLoading={history.isPending}
          onIdentityChanged={onIdentityChanged}
        />
      );
    case 'provisioning':
      return <ProvisioningHistoryPanel employeeId={record.id} />;
    case 'security':
      return <SecurityEventsPanel employeeId={record.id} keycloakId={record.keycloakId} />;
    case 'sessions':
      return <EmployeeSessionsPanel employeeId={record.id} keycloakId={record.keycloakId} />;
  }
}
