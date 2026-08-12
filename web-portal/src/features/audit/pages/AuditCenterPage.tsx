import type { ColumnDef } from '@tanstack/react-table';
import { Download, ScrollText, SearchX } from 'lucide-react';
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';

import { isApiError } from '@/shared/api';
import { messageFor } from '@/shared/api/form-errors';
import {
  Alert,
  DataTable,
  EmptyState,
  FilterBar,
  FilterDate,
  FilterSelect,
  PageContainer,
  PageHeader,
  SearchField,
  StatusBadge,
} from '@/shared/components';
import {
  Button,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui';
import { useUrlFilters } from '@/shared/hooks/use-url-filters';
import { formatDateTime } from '@/shared/lib/format';
import { PersonReference, usePeopleLookupRef, type PersonLookup } from '@/shared/people';
import type { AuditEntryResponse } from '@/shared/types/hr';

import {
  auditSort,
  AUDIT_DEFAULT_SORT,
  AUDIT_MAX_EXPORT_ROWS,
  AUDIT_PAGE_SIZE,
  AUDIT_RESULTS,
  exportAuditCsv,
  useAuditListQuery,
  type AuditFilterParams,
} from '../api/audit-api';
import { AuditEventDetails } from '../components/AuditEventDetails';
import { auditActionLabel, auditServiceLabel, parseAuditResource } from '../humanize';

/**
 * P23 — Audit Center (`/hr/audit`). HR + ADMIN.
 *
 * The investigation surface over the append-only trail. Three things shape it,
 * all of them facts about the backend rather than design preferences:
 *
 *  1. **Every filter is server-side.** `AuditLogSpecifications` ANDs the present
 *     predicates in SQL, so a filtered page is a genuine page with a truthful
 *     total. Nothing here narrows a fetched page — the rules forbid client-side
 *     filtering that pretends to be server filtering, and over an audit trail it
 *     would also be dangerous: an investigator would conclude an event does not
 *     exist because it was not on page 1.
 *  2. **Sort affordances exist only on the four whitelisted columns.** The
 *     server silently drops anything else, so a sortable-looking header on
 *     `details` would order nothing while claiming to.
 *  3. **There is no correlation-id, IP, role or session filter**, because the
 *     trail does not record those columns. The bar says so rather than leaving
 *     an investigator hunting for a control that was never there.
 *
 * The charts live behind `React.lazy` on the statistics tab: Recharts is a large
 * dependency and an investigator arriving at the events table should not pay for
 * it before opening the tab that uses it.
 */

const AuditStatistics = lazy(() =>
  import('../components/AuditStatistics').then((module) => ({ default: module.AuditStatistics })),
);

/**
 * The endpoint's filters, and ONLY those.
 *
 * `tab` is deliberately absent: it selects which view is open, it is never sent
 * to the server, and counting it as a filter would corrupt the one distinction
 * this page cannot get wrong — `isFiltered` decides whether an empty table says
 * "the trail is empty" or "nothing matches your filters". Opening the
 * statistics tab must not make the events table claim a filter is hiding
 * events. (It would also put a pointless "Clear filters" button on screen.)
 */
const FILTER_KEYS = ['from', 'to', 'user', 'action', 'resource', 'result'] as const;
const TAB_KEYS = ['tab'] as const;

const RESULT_OPTIONS = AUDIT_RESULTS.map((value) => ({
  value,
  label: value === 'SUCCESS' ? 'Success' : 'Failure',
}));

/**
 * `<input type="date">` gives a calendar day; the endpoint parses an ISO
 * date-time. The bounds are widened to cover the whole day in each direction —
 * a `to` of `2026-07-31` that meant midnight would silently exclude everything
 * that happened that day, which is the kind of off-by-one an audit tool must
 * not have.
 */
function startOfDay(date: string | undefined): string | undefined {
  return date ? `${date}T00:00:00Z` : undefined;
}
function endOfDay(date: string | undefined): string | undefined {
  return date ? `${date}T23:59:59Z` : undefined;
}

/**
 * The identifier out of an `employee:<uuid>` target, or `null` for any other
 * kind. Only employee targets name a person; a `leave_request:<uuid>` is a
 * record, and asking the resolver about it would be a request we know cannot
 * answer.
 */
function employeeTargetOf(entry: AuditEntryResponse): string | null {
  const resource = parseAuditResource(entry.resource);
  return resource?.kind === 'employee' ? resource.id : null;
}

/**
 * The target of one event: the person when it is an employee the resolver
 * knows, the reference itself otherwise.
 *
 * hr-service writes `employee:<employeeId>`, while the offboarding fan-out rows
 * the other services write carry a Keycloak subject in the same position — so
 * both readings are tried rather than assuming the convention holds everywhere.
 */
function AuditTargetCell({ entry, people }: { entry: AuditEntryResponse; people: PersonLookup }) {
  const resource = parseAuditResource(entry.resource);
  if (!resource) return <span className="text-ink-muted">—</span>;

  if (resource.kind === 'employee') {
    const byEmployee = people.byEmployeeId(resource.id);
    const resolution =
      byEmployee.state === 'resolved' ? byEmployee : people.byKeycloakId(resource.id);
    if (resolution.state === 'resolved') {
      return <PersonReference resolution={resolution} fallback={resource.id} showMatricule />;
    }
  }

  return (
    <span className="flex min-w-0 flex-col" title={resource.raw}>
      <span className="text-body-secondary text-ink">{resource.label}</span>
      <span className="truncate font-mono text-mono-sm text-ink-muted">{resource.id}</span>
    </span>
  );
}

export function AuditCenterPage() {
  const {
    page,
    sort,
    search,
    filters,
    setPage,
    setSort,
    setSearch,
    setFilter,
    clearFilters,
    isFiltered,
  } = useUrlFilters({ keys: FILTER_KEYS, defaultSort: AUDIT_DEFAULT_SORT });

  // The open view is URL state too (a link to the statistics is a link), but it
  // is not a filter — hence its own binding rather than a seventh filter key.
  const { filters: view, setFilter: setView } = useUrlFilters({ keys: TAB_KEYS });

  const filterParams: AuditFilterParams = {
    from: startOfDay(filters.from),
    to: endOfDay(filters.to),
    user: filters.user,
    action: filters.action,
    resource: filters.resource,
    result: filters.result,
    search,
  };

  const query = useAuditListQuery({ ...filterParams, page, sort });

  const [openEvent, setOpenEvent] = useState<AuditEntryResponse | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportOutcome, setExportOutcome] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const tab = view.tab === 'statistics' ? 'statistics' : 'events';

  const runExport = async () => {
    setExporting(true);
    setExportOutcome(null);
    setExportError(null);
    try {
      await exportAuditCsv(filterParams);
      setExportOutcome(
        'Export downloaded. The export itself was recorded in the trail as AUDIT_EXPORTED.',
      );
    } catch (error) {
      setExportError(
        `${messageFor(error)}${
          isApiError(error) && error.kind !== 'network' && error.correlationId
            ? ` (correlation id ${error.correlationId})`
            : ''
        }`,
      );
    } finally {
      setExporting(false);
    }
  };

  // Actors are logins and employee targets are ids; the trail stores no names.
  // One resolve per page of rows turns both into people, and the raw values
  // stay on the event's technical detail.
  const rows = query.data?.content ?? [];
  const people = usePeopleLookupRef({
    usernames: rows.map((row) => row.user),
    employeeIds: rows.map(employeeTargetOf),
    keycloakIds: rows.map(employeeTargetOf),
  });

  const columns = useMemo<ColumnDef<AuditEntryResponse, unknown>[]>(
    () => [
      {
        id: 'occurredAt',
        header: 'When',
        meta: { ...auditSort('occurredAt'), priority: true },
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-mono-sm tabular-nums text-ink-strong">
            {formatDateTime(row.original.timestamp)}
          </span>
        ),
      },
      {
        id: 'actor',
        header: 'Recorded by',
        meta: { ...auditSort('actor'), priority: true },
        // Sorting still orders by the stored login — the whitelisted column —
        // even though the cell reads as a name. Offering a "sort by name" the
        // server cannot honour is the one thing this column must not do.
        cell: ({ row }) => (
          <PersonReference
            resolution={people.current.byUsername(row.original.user)}
            fallback={row.original.user}
            fullFallback
          />
        ),
      },
      {
        id: 'action',
        header: 'Action',
        meta: { ...auditSort('action'), priority: true },
        cell: ({ row }) => {
          const label = auditActionLabel(row.original.action);
          return (
            <button
              type="button"
              className="flex flex-col text-left text-ink-strong underline decoration-transparent underline-offset-2 hover:decoration-current"
              onClick={() => setOpenEvent(row.original)}
            >
              <span className="text-body-secondary">{label ?? row.original.action}</span>
              {label ? (
                <span className="font-mono text-mono-sm text-ink-muted">{row.original.action}</span>
              ) : null}
            </button>
          );
        },
      },
      {
        id: 'resource',
        header: 'Target',
        meta: { ...auditSort('resource'), hideBelowLg: true },
        cell: ({ row }) => <AuditTargetCell entry={row.original} people={people.current} />,
      },
      {
        id: 'result',
        header: 'Result',
        meta: { priority: true },
        cell: ({ row }) => <StatusBadge status={row.original.result} />,
      },
      {
        id: 'service',
        header: 'Service',
        meta: { hideBelowLg: true },
        cell: ({ row }) => auditServiceLabel(row.original.service),
      },
    ],
    [people],
  );

  return (
    <PageContainer>
      <PageHeader
        title="Audit Center"
        description="The append-only record of every sensitive action. Read-only by design — audit entries can never be edited or deleted."
        actions={
          <Button variant="secondary" loading={exporting} onClick={() => void runExport()}>
            <Download aria-hidden="true" />
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {/* No wrapping live region: `Alert` is already one (`role="status"` /
            `role="alert"`), and nesting them makes every outcome announce
            twice. */}
        {exportOutcome ? (
          <Alert tone="info" title="Export complete">
            <p>{exportOutcome}</p>
          </Alert>
        ) : null}
        {exportError ? (
          <Alert tone="danger" live="assertive" title="The export failed">
            <p>{exportError}</p>
          </Alert>
        ) : null}

        <Tabs
          value={tab}
          onValueChange={(next) => setView('tab', next === 'events' ? undefined : next)}
        >
          <TabsList>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="statistics">Statistics</TabsTrigger>
          </TabsList>

          <TabsContent value="events">
            <div className="flex flex-col gap-4">
              <FilterBar onClear={clearFilters} isFiltered={isFiltered}>
                <SearchField
                  value={search}
                  onChange={setSearch}
                  label="Search the trail"
                  placeholder="Search actor, action, target or details"
                />
                <FilterDate
                  label="From"
                  value={filters.from}
                  onChange={(value) => setFilter('from', value)}
                />
                <FilterDate
                  label="To"
                  value={filters.to}
                  onChange={(value) => setFilter('to', value)}
                />
                <LabelledInput
                  label="Actor"
                  placeholder="Login name"
                  value={filters.user ?? ''}
                  onChange={(value) => setFilter('user', value || undefined)}
                />
                <LabelledInput
                  label="Action"
                  placeholder="EMPLOYEE_OFFBOARDED"
                  mono
                  value={filters.action ?? ''}
                  onChange={(value) => setFilter('action', value || undefined)}
                />
                <LabelledInput
                  label="Target"
                  placeholder="employee:…"
                  mono
                  value={filters.resource ?? ''}
                  onChange={(value) => setFilter('resource', value || undefined)}
                />
                <FilterSelect
                  label="Result"
                  anyLabel="Any result"
                  value={filters.result}
                  onChange={(value) => setFilter('result', value)}
                  options={RESULT_OPTIONS}
                />
              </FilterBar>

              <p className="text-caption text-ink-muted">
                Filters are applied by the server, so a filtered page is a real page. The action
                filter matches exactly; actor and target match on a contained string. There is no
                correlation-id, IP address, role or session filter because the trail does not record
                those — the correlation id lives in the service logs, not in this table. Export
                writes at most {AUDIT_MAX_EXPORT_ROWS.toLocaleString('en-GB')} rows and is itself
                recorded in the trail.
              </p>

              <DataTable
                caption="Audit events"
                columns={columns}
                page={query.data}
                isLoading={query.isPending}
                isFetching={query.isFetching}
                error={query.error}
                onRetry={() => void query.refetch()}
                sort={sort}
                onSortChange={setSort}
                onPageChange={setPage}
                label="audit events"
                isFiltered={isFiltered}
                rowId={(row) => row.id}
                cardTitle={(row) => <span className="font-mono">{row.action}</span>}
                rowActions={(row) => (
                  <Button variant="ghost" size="compact" onClick={() => setOpenEvent(row)}>
                    Details
                    <span className="sr-only"> of {row.action}</span>
                  </Button>
                )}
                emptyState={
                  <EmptyState
                    icon={ScrollText}
                    title="The trail is empty"
                    description="No sensitive action has been recorded yet. Entries appear here as soon as one is."
                  />
                }
                noMatchesState={
                  <EmptyState
                    icon={SearchX}
                    title="No events match these filters"
                    description="The trail is not empty — nothing in it matches what you asked for. Widen the date range or clear a filter; a filter that returns nothing is an answer, not a failure."
                  />
                }
              />

              <p className="text-caption text-ink-muted">
                Showing up to {AUDIT_PAGE_SIZE} events per page.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="statistics">
            <Suspense
              fallback={
                <div aria-busy="true">
                  <span className="sr-only">Loading the statistics view</span>
                  <Skeleton className="h-64 w-full" />
                </div>
              }
            >
              <AuditStatistics from={filterParams.from} to={filterParams.to} />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>

      <AuditEventDetails
        eventId={openEvent?.id ?? null}
        fallback={openEvent}
        onOpenChange={(open) => {
          if (!open) setOpenEvent(null);
        }}
      />
    </PageContainer>
  );
}

/**
 * A free-text filter with a visible label, **debounced** exactly as
 * `SearchField` is.
 *
 * The debounce is not a nicety here. These filters write to the URL, and the
 * URL is what the query key is built from — so an undebounced control turns
 * typing `EMPLOYEE_OFFBOARDED` into twenty round trips through the gateway and
 * twenty entries in the router's history, on the one screen where each of those
 * requests scans an append-only table.
 *
 * `FilterBar` ships select and date controls; the audit trail's actor/action/
 * target filters are the only free-text ones in the product, so this stays
 * feature-private rather than being promoted on the strength of one caller
 * (FRONTEND-ARCHITECTURE §3).
 */
function LabelledInput({
  label,
  value,
  onChange,
  placeholder,
  mono,
  debounceMs = 300,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  debounceMs?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Re-sync when the URL changes underneath (back button, "clear filters"), so
  // the box never shows a filter that is no longer applied.
  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChangeRef.current(draft), debounceMs);
    return () => clearTimeout(timer);
  }, [draft, value, debounceMs]);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-caption text-ink-muted">
        {label}
      </label>
      <Input
        id={id}
        compact
        value={draft}
        placeholder={placeholder}
        className={mono ? 'font-mono' : undefined}
        onChange={(event) => setDraft(event.target.value)}
      />
    </div>
  );
}
