import type { ColumnDef } from '@tanstack/react-table';
import { SearchX, Users } from 'lucide-react';
import { useMemo } from 'react';

import {
  DataTable,
  EmptyState,
  EmployeeCell,
  FilterBar,
  FilterSelect,
  PageContainer,
  PageHeader,
  SearchField,
  StatusBadge,
} from '@/shared/components';
import { useUrlFilters } from '@/shared/hooks/use-url-filters';
import { formatDate } from '@/shared/lib/format';
import type { EmployeeProfileResponse } from '@/shared/types/hr';

import { TEAM_DEFAULT_SORT, useTeamQuery } from '../api/team-api';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DISABLED', label: 'Disabled' },
  { value: 'TERMINATED', label: 'Terminated' },
] as const;

const FILTER_KEYS = ['status'] as const;

/**
 * P15 — My team. The manager's DIRECT reports, paged by the server.
 *
 * Read-only on purpose: this endpoint is a window, not an admin surface. A
 * manager can see who reports to them; changing any of it is HR's job (Phase 4)
 * and the server would refuse anyway.
 *
 * Two honesty constraints the page is built around:
 *  - it says "direct reports" and never implies a recursive org chart, because
 *    the backend has no recursive query;
 *  - department and position are **filters the endpoint does not offer as
 *    catalogues** — the ids exist but the catalogue is HR-only, so the UI offers
 *    search and status rather than a picker it could not populate honestly
 *    (FRONTEND-SPECIFICATION §5 footnote).
 */
export function TeamPage() {
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
  } = useUrlFilters({ keys: FILTER_KEYS, defaultSort: TEAM_DEFAULT_SORT });

  const query = useTeamQuery({ page, sort, search, status: filters.status });

  const columns = useMemo<ColumnDef<EmployeeProfileResponse, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        // Sorted on the server by lastName — the column shows both names, so
        // the affordance names the property people expect to sort by.
        meta: { sortKey: 'lastName' },
        cell: ({ row }) => (
          <EmployeeCell
            name={`${row.original.firstName} ${row.original.lastName}`}
            matricule={row.original.matricule}
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
        cell: ({ row }) => row.original.departmentName ?? '—',
      },
      {
        id: 'position',
        header: 'Position',
        meta: { hideBelowLg: true },
        cell: ({ row }) => row.original.positionTitle ?? '—',
      },
      {
        id: 'hireDate',
        header: 'Hire date',
        meta: { sortKey: 'hireDate', hideBelowLg: true },
        cell: ({ row }) => formatDate(row.original.hireDate),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { sortKey: 'status', priority: true },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [],
  );

  return (
    <PageContainer>
      <PageHeader
        title="My team"
        description="The people who report directly to you. Read-only — workforce changes are made by HR."
      />

      <div className="flex flex-col gap-4">
        <FilterBar onClear={clearFilters} isFiltered={isFiltered}>
          <SearchField
            value={search}
            onChange={setSearch}
            label="Search your team"
            placeholder="Search by name, matricule or email"
          />
          <FilterSelect
            label="Status"
            anyLabel="Any status"
            value={filters.status}
            onChange={(value) => setFilter('status', value)}
            options={STATUS_OPTIONS}
          />
        </FilterBar>

        <DataTable
          caption="Your direct reports"
          columns={columns}
          page={query.data}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          error={query.error}
          onRetry={() => void query.refetch()}
          sort={sort}
          onSortChange={setSort}
          onPageChange={setPage}
          label="team members"
          isFiltered={isFiltered}
          rowId={(row) => row.id}
          cardTitle={(row) => `${row.firstName} ${row.lastName}`}
          emptyState={
            <EmptyState
              icon={Users}
              title="Nobody reports to you yet"
              description="When HR assigns you as someone's manager, they appear here — along with their leave and expense requests in your approvals inbox."
            />
          }
          noMatchesState={
            <EmptyState
              icon={SearchX}
              title="No team members match these filters"
              description="Your team is not empty — nothing matches what you have narrowed it to. Clear the filters to see everyone."
            />
          }
        />
      </div>
    </PageContainer>
  );
}
