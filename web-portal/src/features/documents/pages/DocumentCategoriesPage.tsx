import type { ColumnDef } from '@tanstack/react-table';
import { FolderTree, Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  ConfirmActionDialog,
  DataTable,
  EmptyState,
  FilterBar,
  PageContainer,
  PageHeader,
  SearchField,
  StatusBadge,
  useConfirmation,
} from '@/shared/components';
import { Button, IconButton } from '@/shared/components/ui';
import { useUrlFilters } from '@/shared/hooks/use-url-filters';
import { formatDateTime } from '@/shared/lib/format';
import type { DocumentCategoryResponse } from '@/shared/types/documents';

import {
  categorySort,
  CATEGORY_DEFAULT_SORT,
  useDeleteDocumentCategoryMutation,
  useDocumentCategoryListQuery,
} from '../api/documents-api';
import { CategoryFormDialog } from '../components/CategoryFormDialog';
import { minRoleLabel } from '../components/min-role';

/**
 * P25 — Document categories (`/admin/document-categories`). **ADMIN only.**
 *
 * The single privilege HR does not have: `DocumentCategoryController` reads are
 * HR+ADMIN but every write is `hasRole('ADMIN')`. This page is the write
 * surface, so the whole route is admin-guarded.
 *
 * Deleting is the one destructive action, and the server refuses with `409`
 * while any document is still filed under the category. That sentence is shown
 * in the dialog rather than as a toast to chase: the fix — re-file those
 * documents first — belongs where the decision was made.
 */
const NO_FILTER_KEYS = [] as const;

export function DocumentCategoriesPage() {
  const { page, sort, search, setPage, setSort, setSearch, clearFilters, isFiltered } =
    useUrlFilters({ keys: NO_FILTER_KEYS, defaultSort: CATEGORY_DEFAULT_SORT });

  const query = useDocumentCategoryListQuery({ page, sort, search });
  const remove = useDeleteDocumentCategoryMutation();
  const confirmation = useConfirmation();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentCategoryResponse | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<DocumentCategoryResponse | null>(null);

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (category: DocumentCategoryResponse) => {
    setEditing(category);
    setFormOpen(true);
  };
  const askDelete = (category: DocumentCategoryResponse) => {
    setPendingDelete(category);
    confirmation.ask();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      confirmation.close();
      setPendingDelete(null);
    } catch (error) {
      confirmation.setError(error);
    }
  };

  const columns = useMemo<ColumnDef<DocumentCategoryResponse, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        meta: categorySort('name'),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-ink-strong">{row.original.name}</span>
            {row.original.sensitive ? <StatusBadge status="SENSITIVE_DOCUMENT" /> : null}
          </div>
        ),
      },
      {
        id: 'minRole',
        header: 'Minimum role',
        meta: { ...categorySort('minRole'), priority: true },
        cell: ({ row }) => minRoleLabel(row.original.minRole),
      },
      {
        id: 'description',
        header: 'Description',
        meta: { hideBelowLg: true },
        cell: ({ row }) => row.original.description ?? '—',
      },
      {
        id: 'updatedAt',
        header: 'Last updated',
        meta: { ...categorySort('updatedAt'), hideBelowLg: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatDateTime(row.original.updatedAt)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <PageContainer>
      <PageHeader
        title="Document categories"
        description="The access tiers documents are filed into. A category's minimum role is what makes its documents sensitive."
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden="true" />
            New category
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <FilterBar onClear={clearFilters} isFiltered={isFiltered}>
          <SearchField
            value={search}
            onChange={setSearch}
            label="Search categories"
            placeholder="Search by name or description"
          />
        </FilterBar>

        <DataTable
          caption="Document categories"
          columns={columns}
          page={query.data}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          error={query.error}
          onRetry={() => void query.refetch()}
          sort={sort}
          onSortChange={setSort}
          onPageChange={setPage}
          label="categories"
          isFiltered={isFiltered}
          rowId={(row) => row.id}
          cardTitle={(row) => row.name}
          rowActions={(row) => (
            <>
              <IconButton size="compact" label={`Edit ${row.name}`} onClick={() => openEdit(row)}>
                <Pencil aria-hidden="true" />
              </IconButton>
              <IconButton
                size="compact"
                label={`Delete ${row.name}`}
                onClick={() => askDelete(row)}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            </>
          )}
          emptyState={
            <EmptyState
              icon={FolderTree}
              title="No categories yet"
              description="A document must be filed under a category, so the library needs at least one before anything can be uploaded."
              action={<Button onClick={openCreate}>New category</Button>}
            />
          }
          noMatchesState={
            <EmptyState
              icon={SearchX}
              title="No categories match this search"
              description="The catalogue is not empty — nothing matches what you searched for. Clear the search to see every category."
            />
          }
        />
      </div>

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={editing} />

      <ConfirmActionDialog
        open={confirmation.open}
        onOpenChange={(next) => {
          confirmation.onOpenChange(next);
          if (!next) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.name ?? 'this category'}?`}
        description={
          <>
            This removes the category{' '}
            <strong className="text-ink-strong">{pendingDelete?.name}</strong> from the catalogue.
          </>
        }
        consequences={[
          'It disappears from the upload form, so nothing new can be filed under it.',
          'The server refuses while any document is still filed here — re-file those documents first.',
          'Deletion cannot be undone.',
        ]}
        confirmLabel="Delete category"
        destructive
        busy={remove.isPending}
        error={confirmation.error}
        onConfirm={() => void confirmDelete()}
      />
    </PageContainer>
  );
}
