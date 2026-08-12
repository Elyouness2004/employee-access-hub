import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  ConfirmActionDialog,
  DataTable,
  EmptyState,
  FilterBar,
  PageContainer,
  PageHeader,
  SearchField,
  useConfirmation,
} from '@/shared/components';
import { Button, IconButton } from '@/shared/components/ui';
import { useUrlFilters } from '@/shared/hooks/use-url-filters';
import { formatDateTime } from '@/shared/lib/format';

import {
  useCatalogueListQuery,
  useDeleteCatalogueEntryMutation,
  type CatalogueDescriptor,
  type CatalogueEntryView,
} from '../api/organization-api';
import { CatalogueFormDialog } from './CatalogueFormDialog';

/**
 * P18 / P19 — the catalogue admin screen, rendered twice from one component.
 *
 * Departments and positions are the same controller with a different label
 * field (see `organization-api.ts`), so they get the same screen rather than two
 * copies that drift. Everything server-driven stays server-driven: paging, the
 * sort (only on the columns the controller whitelists), and the search — the
 * table never slices a page it was handed.
 *
 * Deletion is the one destructive action here and it is never silent: the
 * confirmation names the entry and says what deletion does. The server refuses
 * with `409` while employees are still assigned, and that sentence is shown in
 * the dialog rather than as a toast the user has to chase — the fix (reassign
 * those employees first) belongs where the decision was made.
 *
 * There is deliberately no hierarchy, no parent picker and no tree: the
 * `Department` and `Position` aggregates hold an id, a label and a description,
 * and inventing structure the backend cannot store would be a lie the first
 * reload exposes.
 */
export interface CataloguePageProps {
  catalogue: CatalogueDescriptor;
  title: string;
  description: string;
  /** What an empty catalogue means, in this catalogue's terms. */
  emptyDescription: string;
}

const NO_FILTER_KEYS = [] as const;

export function CataloguePage({
  catalogue,
  title,
  description,
  emptyDescription,
}: CataloguePageProps) {
  const { page, sort, search, setPage, setSort, setSearch, clearFilters, isFiltered } =
    useUrlFilters({ keys: NO_FILTER_KEYS, defaultSort: catalogue.defaultSort });

  const query = useCatalogueListQuery(catalogue, { page, sort, search });
  const remove = useDeleteCatalogueEntryMutation(catalogue);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogueEntryView | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<CatalogueEntryView | null>(null);
  const confirmation = useConfirmation();

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (entry: CatalogueEntryView) => {
    setEditing(entry);
    setFormOpen(true);
  };
  const askDelete = (entry: CatalogueEntryView) => {
    setPendingDelete(entry);
    confirmation.ask();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      confirmation.close();
      setPendingDelete(null);
    } catch (error) {
      // 409 "still has employees assigned" is the interesting one: it is
      // actionable, and the server's own sentence says which reference blocks
      // it. The correlation id goes with it — every error surface shows one
      // (DESIGN-SYSTEM §9.4).
      confirmation.setError(error);
    }
  };

  const columns = useMemo<ColumnDef<CatalogueEntryView, unknown>[]>(
    () => [
      {
        id: 'label',
        header: catalogue.labelHeading,
        meta: { sortKey: catalogue.labelField },
        cell: ({ row }) => <span className="text-ink-strong">{row.original.label}</span>,
      },
      {
        id: 'description',
        header: 'Description',
        meta: { priority: true },
        cell: ({ row }) => row.original.description ?? '—',
      },
      {
        id: 'updatedAt',
        header: 'Last updated',
        meta: { sortKey: 'updatedAt', hideBelowLg: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatDateTime(row.original.updatedAt)}</span>
        ),
      },
    ],
    [catalogue.labelHeading, catalogue.labelField],
  );

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden="true" />
            New {catalogue.singular}
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <FilterBar onClear={clearFilters} isFiltered={isFiltered}>
          <SearchField
            value={search}
            onChange={setSearch}
            label={`Search ${catalogue.plural}`}
            placeholder={`Search by ${catalogue.labelHeading.toLowerCase()} or description`}
          />
        </FilterBar>

        <DataTable
          caption={`${title} catalogue`}
          columns={columns}
          page={query.data}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          error={query.error}
          onRetry={() => void query.refetch()}
          sort={sort}
          onSortChange={setSort}
          onPageChange={setPage}
          label={catalogue.plural}
          isFiltered={isFiltered}
          rowId={(row) => row.id}
          cardTitle={(row) => row.label}
          rowActions={(row) => (
            <>
              <IconButton size="compact" label={`Edit ${row.label}`} onClick={() => openEdit(row)}>
                <Pencil aria-hidden="true" />
              </IconButton>
              <IconButton
                size="compact"
                label={`Delete ${row.label}`}
                onClick={() => askDelete(row)}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            </>
          )}
          emptyState={
            <EmptyState
              icon={Plus}
              title={`No ${catalogue.plural} yet`}
              description={emptyDescription}
              action={<Button onClick={openCreate}>New {catalogue.singular}</Button>}
            />
          }
          noMatchesState={
            <EmptyState
              icon={SearchX}
              title={`No ${catalogue.plural} match this search`}
              description={`The catalogue is not empty — nothing matches what you searched for. Clear the search to see every ${catalogue.singular}.`}
            />
          }
        />
      </div>

      <CatalogueFormDialog
        catalogue={catalogue}
        open={formOpen}
        onOpenChange={setFormOpen}
        entry={editing}
      />

      <ConfirmActionDialog
        open={confirmation.open}
        onOpenChange={(next) => {
          confirmation.onOpenChange(next);
          if (!next) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.label ?? `this ${catalogue.singular}`}?`}
        description={
          <>
            This removes the {catalogue.singular}{' '}
            <strong className="text-ink-strong">{pendingDelete?.label}</strong> from the catalogue.
          </>
        }
        consequences={[
          `It disappears from the employee form, so nobody new can be assigned to it.`,
          `The server refuses while any employee is still assigned — reassign them first.`,
          'Deletion cannot be undone.',
        ]}
        confirmLabel={`Delete ${catalogue.singular}`}
        destructive
        busy={remove.isPending}
        error={confirmation.error}
        onConfirm={() => void confirmDelete()}
      />
    </PageContainer>
  );
}
