import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Pencil, SearchX, Trash2, UserPlus, Users } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { correlationIdOf } from '@/shared/api';
import {
  catalogueLabel,
  useDepartmentCatalogueQuery,
  usePositionCatalogueQuery,
  CATALOGUE_PAGE_SIZE,
} from '@/shared/catalogues';
import {
  Alert,
  ConfirmActionDialog,
  DataTable,
  EmployeeCell,
  EmptyState,
  FilterBar,
  FilterSelect,
  PageContainer,
  PageHeader,
  SearchField,
  StatusBadge,
  useConfirmation,
} from '@/shared/components';
import { AppLink, Button, IconButton } from '@/shared/components/ui';
import { useUrlFilters } from '@/shared/hooks/use-url-filters';
import { formatDate } from '@/shared/lib/format';
import type { EmployeeResponse } from '@/shared/types/hr';

import {
  employeeName,
  useDeleteEmployeeMutation,
  useEmployeeListQuery,
  EMPLOYEE_DEFAULT_SORT,
} from '../api/employees-api';
import { CatalogueReference } from '../components/CatalogueReference';
import { EmployeeFormDialog } from '../components/EmployeeFormDialog';
import { EmployeePicker } from '../components/EmployeePicker';

/**
 * P16 — Employee directory (`/hr/employees`). HR + ADMIN.
 *
 * Everything about this list is the server's: the page, the order, the search
 * and every filter. The sort affordances appear only on
 * `EmployeeController.SORTABLE`, because the controller drops anything else
 * silently and a header that looks sortable but is not would read as a bug the
 * user cannot report.
 *
 * **The provisioning column the specification asks for cannot be built.**
 * `EmployeeResponse` carries no `provisioningStatus` — the endpoint takes it as
 * a filter and a sort key but does not return it per row (verified in
 * `EmployeeResponse.java`). Rather than guess a state or leave a column of
 * dashes, the table states the fact it does have: whether a login account is
 * LINKED, which is precisely `Employee.isProvisioned()` (`keycloakId != null`).
 * The provisioning filter is still offered, because it genuinely narrows the
 * server-side scope, and the note under the filter bar says so plainly. Per-row
 * provisioning state requires backend work.
 *
 * Department and position are joined from the shared catalogue lookup: the rows
 * carry raw UUIDs, and HR — unlike an employee — can read those catalogues.
 * A label that has not resolved yet and a dangling reference read differently.
 *
 * There is no bulk selection: the platform has no bulk endpoint, and a checkbox
 * column that could only ever loop client-side would promise a transaction the
 * server never agreed to.
 */

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DISABLED', label: 'Disabled' },
  { value: 'TERMINATED', label: 'Terminated' },
] as const;

/** `com.hub.hr.domain.ProvisioningStatus`, verbatim. */
const PROVISIONING_OPTIONS = [
  { value: 'NOT_PROVISIONED', label: 'Not provisioned' },
  { value: 'PROVISIONED', label: 'Provisioned' },
  { value: 'FAILED', label: 'Provisioning failed' },
  { value: 'DISABLED', label: 'Disabled' },
  { value: 'LOCKED', label: 'Locked' },
] as const;

const FILTER_KEYS = [
  'status',
  'provisioningStatus',
  'departmentId',
  'positionId',
  'managerId',
] as const;

interface CreatedNotice {
  employee: EmployeeResponse;
  provisioningRequested: boolean;
}

export function EmployeeDirectoryPage() {
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
  } = useUrlFilters({ keys: FILTER_KEYS, defaultSort: EMPLOYEE_DEFAULT_SORT });
  const managerFilterId = useId();

  const query = useEmployeeListQuery({
    page,
    sort,
    search,
    status: filters.status,
    provisioningStatus: filters.provisioningStatus,
    departmentId: filters.departmentId,
    positionId: filters.positionId,
    managerId: filters.managerId,
  });
  const departments = useDepartmentCatalogueQuery();
  const positions = usePositionCatalogueQuery();
  const remove = useDeleteEmployeeMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeResponse | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<EmployeeResponse | null>(null);
  const [created, setCreated] = useState<CreatedNotice | null>(null);
  const confirmation = useConfirmation();

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (employee: EmployeeResponse) => {
    setEditing(employee);
    setFormOpen(true);
  };
  const askDelete = (employee: EmployeeResponse) => {
    setPendingDelete(employee);
    confirmation.ask();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      confirmation.close();
      setPendingDelete(null);
    } catch (error) {
      // 409 here is "still manages direct reports" — actionable, and only the
      // server knows it. The correlation id goes with it: every error surface
      // shows one (DESIGN-SYSTEM §9.4).
      confirmation.setError(error);
    }
  };

  const departmentCatalogue = departments.data;
  const positionCatalogue = positions.data;
  const catalogueError = departments.error ?? positions.error;
  const catalogueCorrelationId = correlationIdOf(catalogueError);
  const catalogueTruncated =
    Boolean(departmentCatalogue?.truncated) || Boolean(positionCatalogue?.truncated);
  const retryCatalogues = () => {
    if (departments.error) void departments.refetch();
    if (positions.error) void positions.refetch();
  };

  const columns = useMemo<ColumnDef<EmployeeResponse, unknown>[]>(
    () => [
      {
        id: 'employee',
        header: 'Employee',
        // Sorted server-side on lastName; the cell shows both names.
        meta: { sortKey: 'lastName' },
        cell: ({ row }) => (
          <EmployeeCell
            name={employeeName(row.original)}
            matricule={row.original.matricule}
            to={`/hr/employees/${row.original.id}`}
          />
        ),
      },
      {
        id: 'email',
        header: 'Work email',
        meta: { sortKey: 'email', hideBelowLg: true },
        cell: ({ row }) => <span className="break-all">{row.original.email}</span>,
      },
      {
        id: 'department',
        header: 'Department',
        meta: { priority: true },
        cell: ({ row }) => (
          <CatalogueReference
            resolved={catalogueLabel(
              departmentCatalogue,
              row.original.departmentId,
              (entry) => entry.name,
            )}
            isLoading={departments.isPending}
            isUnavailable={Boolean(departments.error)}
            id={row.original.departmentId}
          />
        ),
      },
      {
        id: 'position',
        header: 'Position',
        meta: { hideBelowLg: true },
        cell: ({ row }) => (
          <CatalogueReference
            resolved={catalogueLabel(
              positionCatalogue,
              row.original.positionId,
              (entry) => entry.title,
            )}
            isLoading={positions.isPending}
            isUnavailable={Boolean(positions.error)}
            id={row.original.positionId}
          />
        ),
      },
      {
        id: 'hireDate',
        header: 'Hire date',
        meta: { sortKey: 'hireDate', hideBelowLg: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatDate(row.original.hireDate)}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { sortKey: 'status', priority: true },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'account',
        header: 'Account',
        meta: { priority: true },
        cell: ({ row }) =>
          row.original.keycloakId ? (
            <span
              className="inline-flex items-center gap-1 text-ink"
              title={row.original.keycloakId}
            >
              <KeyRound aria-hidden="true" className="size-4 text-ink-muted" />
              Linked
            </span>
          ) : (
            <span className="text-ink-muted">Not linked</span>
          ),
      },
    ],
    [
      departmentCatalogue,
      positionCatalogue,
      departments.isPending,
      positions.isPending,
      departments.error,
      positions.error,
    ],
  );

  return (
    <PageContainer>
      <PageHeader
        title="Employee directory"
        description="The workforce record every other surface resolves against. HR and administrators only."
        actions={
          <Button onClick={openCreate}>
            <UserPlus aria-hidden="true" />
            New employee
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {/*
          The catalogues are a SECOND request behind this page. When one fails,
          the rows lose their department or position names — and the cause has to
          be stated once, here, rather than implied row by row by a column that
          would otherwise read as "this reference does not exist".
        */}
        {catalogueError ? (
          <Alert
            tone="warning"
            title="Department and position names could not be loaded"
            actions={
              <Button size="compact" variant="secondary" onClick={retryCatalogues}>
                Retry
              </Button>
            }
          >
            <p>
              The directory below is complete and correct — only the catalogue lookup failed, so
              those two columns read “Name unavailable”. Filtering by department or position is
              unavailable until it loads.
            </p>
            {catalogueCorrelationId ? (
              <p className="mt-1 font-mono text-mono-sm">
                Correlation id: {catalogueCorrelationId}
              </p>
            ) : null}
          </Alert>
        ) : null}

        {catalogueTruncated ? (
          <Alert tone="warning" title="Not every catalogue entry is listed">
            The server caps a catalogue page at {CATALOGUE_PAGE_SIZE} entries and there are more
            than that. The department and position filters below therefore offer only the first{' '}
            {CATALOGUE_PAGE_SIZE}, and a row assigned outside them reads “Not in the catalogue”.
            Narrowing this list needs backend work.
          </Alert>
        ) : null}

        {created ? (
          <Alert
            tone="info"
            title={`${employeeName(created.employee)} was created`}
            actions={
              <Button size="compact" variant="secondary" onClick={() => setCreated(null)}>
                Dismiss
              </Button>
            }
          >
            {created.provisioningRequested ? (
              <p>
                The record is Active, so hr-service requested a Keycloak account after saving.
                Provisioning can fail on its own —{' '}
                <Link
                  className="text-link underline"
                  to={`/hr/employees/${created.employee.id}?tab=identity`}
                >
                  check the identity tab
                </Link>{' '}
                to confirm it, or to retry.
              </p>
            ) : (
              <p>
                The record is {created.employee.status === 'DISABLED' ? 'Disabled' : 'Terminated'},
                so no login account was requested.{' '}
                <Link
                  className="text-link underline"
                  to={`/hr/employees/${created.employee.id}?tab=identity`}
                >
                  Open the identity tab
                </Link>{' '}
                when it is time to provision one.
              </p>
            )}
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          <FilterBar onClear={clearFilters} isFiltered={isFiltered}>
            <SearchField
              value={search}
              onChange={setSearch}
              label="Search the directory"
              placeholder="Search by name, matricule or email"
            />
            <FilterSelect
              label="Status"
              anyLabel="Any status"
              value={filters.status}
              onChange={(value) => setFilter('status', value)}
              options={STATUS_OPTIONS}
            />
            <FilterSelect
              label="Provisioning"
              anyLabel="Any provisioning state"
              value={filters.provisioningStatus}
              onChange={(value) => setFilter('provisioningStatus', value)}
              options={PROVISIONING_OPTIONS}
            />
            <FilterSelect
              label="Department"
              anyLabel="Any department"
              value={filters.departmentId}
              onChange={(value) => setFilter('departmentId', value)}
              options={(departmentCatalogue?.items ?? []).map((entry) => ({
                value: entry.id,
                label: entry.name,
              }))}
            />
            <FilterSelect
              label="Position"
              anyLabel="Any position"
              value={filters.positionId}
              onChange={(value) => setFilter('positionId', value)}
              options={(positionCatalogue?.items ?? []).map((entry) => ({
                value: entry.id,
                label: entry.title,
              }))}
            />
            <div className="flex min-w-0 flex-col gap-1">
              {/*
                A real <label for>, like every sibling filter. `aria-labelledby`
                on a wrapping <div> is ignored by assistive tech, which would
                leave this trigger named only by its own value ("Any manager").
              */}
              <label
                id={`${managerFilterId}-label`}
                htmlFor={managerFilterId}
                className="text-caption text-ink-muted"
              >
                Reports to
              </label>
              <EmployeePicker
                compact
                id={managerFilterId}
                labelledBy={`${managerFilterId}-label`}
                noun="manager"
                emptyLabel="Any manager"
                value={filters.managerId ?? null}
                onChange={(value) => setFilter('managerId', value ?? undefined)}
              />
            </div>
          </FilterBar>

          <p className="text-helper text-ink-muted">
            Provisioning narrows the list on the server. It is not returned per row — the Account
            column says whether a login account is linked; the identity tab of an employee holds
            their provisioning history.
          </p>
        </div>

        <DataTable
          caption="Employee directory"
          columns={columns}
          page={query.data}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          error={query.error}
          onRetry={() => void query.refetch()}
          sort={sort}
          onSortChange={setSort}
          onPageChange={setPage}
          label="employees"
          isFiltered={isFiltered}
          rowId={(row) => row.id}
          cardTitle={(row) => (
            <span className="flex flex-col gap-0.5">
              <AppLink to={`/hr/employees/${row.id}`}>{employeeName(row)}</AppLink>
              {/* §7: directory cards show name, mono matricule, then status. */}
              <span className="font-mono text-mono-sm font-normal text-ink-muted">
                {row.matricule}
              </span>
            </span>
          )}
          rowActions={(row) => (
            <>
              <IconButton
                size="compact"
                label={`Edit ${employeeName(row)}`}
                onClick={() => openEdit(row)}
              >
                <Pencil aria-hidden="true" />
              </IconButton>
              <IconButton
                size="compact"
                label={`Delete ${employeeName(row)}`}
                onClick={() => askDelete(row)}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            </>
          )}
          emptyState={
            <EmptyState
              icon={Users}
              title="No employees yet"
              description="Create the first employee record. An Active record also requests a Keycloak account, which is how someone gets to sign in."
              action={<Button onClick={openCreate}>New employee</Button>}
            />
          }
          noMatchesState={
            <EmptyState
              icon={SearchX}
              title="No employees match these filters"
              description="The directory is not empty — nothing matches what you have narrowed it to. Clear the filters to see the whole workforce."
            />
          }
        />
      </div>

      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        employee={editing}
        onSaved={(employee, wasCreated) => {
          if (!wasCreated) return;
          setCreated({
            employee,
            // `EmployeeService.create` publishes the provisioning signal only
            // for an ACTIVE record, and the response is built before the
            // AFTER_COMMIT listener runs — so keycloakId is null either way.
            provisioningRequested: employee.status === 'ACTIVE',
          });
        }}
      />

      <ConfirmActionDialog
        open={confirmation.open}
        onOpenChange={(next) => {
          confirmation.onOpenChange(next);
          if (!next) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete ? employeeName(pendingDelete) : 'this employee'}?`}
        description={
          <>
            This permanently removes the HR record for{' '}
            <strong className="text-ink-strong">
              {pendingDelete ? employeeName(pendingDelete) : ''}
            </strong>{' '}
            ({pendingDelete?.matricule}).
          </>
        }
        consequences={[
          'The HR record and its history in this service are gone — this cannot be undone.',
          'It does NOT disable or delete their Keycloak account. To end someone’s access, offboard them from the Identity tab instead.',
          'The server refuses while they still manage direct reports — reassign those first.',
        ]}
        confirmLabel="Delete record"
        destructive
        busy={remove.isPending}
        error={confirmation.error}
        onConfirm={() => void confirmDelete()}
      />
    </PageContainer>
  );
}
