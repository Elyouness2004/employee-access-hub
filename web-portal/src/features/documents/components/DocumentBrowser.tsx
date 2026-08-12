import type { ColumnDef } from '@tanstack/react-table';
import { FileText, Pencil, SearchX, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useIdentity, useRoles } from '@/shared/auth';
import {
  Alert,
  ConfirmActionDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FilterSelect,
  PageContainer,
  PageHeader,
  SearchField,
  StatusBadge,
  useConfirmation,
} from '@/shared/components';
import { Button, IconButton } from '@/shared/components/ui';
import { useUrlFilters } from '@/shared/hooks/use-url-filters';
import { PersonCell, usePeopleLookupRef } from '@/shared/people';
import { formatDateTime } from '@/shared/lib/format';
import type { DocumentResponse } from '@/shared/types/documents';

import {
  documentSort,
  formatBytes,
  useDeleteDocumentMutation,
  useDocumentCategoryLookupQuery,
  useDocumentListQuery,
} from '../api/documents-api';
import { contentTypeLabel } from '../content-types';
import { DocumentDetailsDialog } from './DocumentDetailsDialog';
import { DocumentFormDialog } from './DocumentFormDialog';
import { FileDownloadAction } from './FileDownloadAction';

/**
 * The document list, rendered twice: as the self-service library (P10) and as
 * the HR/admin management screen (P22).
 *
 * They are the **same endpoint with the same server-side scope** —
 * `GET /api/documents` evaluates the FR-41 rule in SQL, so an employee's page
 * and an HR user's page differ because the server says so, not because the UI
 * hid rows. What genuinely differs is the write surface (upload, edit, delete
 * are `hasAnyRole('HR','ADMIN')`), so that is the one thing `manage` switches.
 *
 * **Two filters, both real, plus one the backend cannot support here.**
 * `categoryId` and `ownerKeycloakId` narrow the query server-side. The category
 * *catalogue*, though, is `hasAnyRole('HR','ADMIN')` — an employee has no way
 * to turn a category name into an id — so the picker is offered only where the
 * catalogue is readable, and a deep link carrying `categoryId` still applies.
 * Building the option list out of whatever happened to be on the current page
 * would produce a control whose options change as you page: the rules call that
 * client-side filtering pretending to be server filtering, and it is.
 */
export interface DocumentBrowserProps {
  /** Adds the HR/ADMIN write surface (upload, edit, delete). */
  manage?: boolean;
  title: string;
  description: string;
}

const FILTER_KEYS = ['categoryId', 'owner'] as const;

/** The owner filter's values — `mine` resolves to the caller's own JWT `sub`. */
const OWNER_OPTIONS = [{ value: 'mine', label: 'Only mine' }] as const;

export function DocumentBrowser({ manage = false, title, description }: DocumentBrowserProps) {
  const identity = useIdentity();
  const { hasAny } = useRoles();
  const canReadCatalogue = hasAny('HR', 'ADMIN');

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
  } = useUrlFilters({ keys: FILTER_KEYS, defaultSort: 'createdAt,desc' });

  const categories = useDocumentCategoryLookupQuery(canReadCatalogue);

  const query = useDocumentListQuery({
    page,
    sort,
    search,
    categoryId: filters.categoryId,
    // A Keycloak subject compared against `ownerKeycloakId` — never an
    // employeeId (FRONTEND-ARCHITECTURE §13).
    ownerKeycloakId: filters.owner === 'mine' ? identity.subject : undefined,
  });

  const remove = useDeleteDocumentMutation();
  const confirmation = useConfirmation();

  const [viewing, setViewing] = useState<DocumentResponse | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentResponse | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<DocumentResponse | null>(null);

  const openUpload = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (document: DocumentResponse) => {
    setEditing(document);
    setFormOpen(true);
  };
  const askDelete = (document: DocumentResponse) => {
    setPendingDelete(document);
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

  // Owners are stored as a Keycloak subject; documents-service holds no names.
  // One resolve for the page of rows. The uploader is resolved by the details
  // dialog instead — it is the only surface that shows one, and asking for it
  // here would spend the request's budget on names nothing renders.
  const people = usePeopleLookupRef({
    keycloakIds: query.data?.content.map((row) => row.ownerKeycloakId),
  });

  const columns = useMemo<ColumnDef<DocumentResponse, unknown>[]>(
    () => [
      {
        id: 'title',
        header: 'Title',
        meta: documentSort('title'),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-1">
            <button
              type="button"
              className="text-left text-ink-strong underline decoration-transparent underline-offset-2 hover:decoration-current"
              onClick={() => setViewing(row.original)}
            >
              {row.original.title}
            </button>
            {row.original.description ? (
              <span className="line-clamp-1 text-caption text-ink-muted">
                {row.original.description}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        meta: { priority: true },
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-ink">{row.original.categoryName}</span>
            {row.original.sensitive ? <StatusBadge status="SENSITIVE_DOCUMENT" /> : null}
          </div>
        ),
      },
      {
        id: 'owner',
        header: 'Belongs to',
        meta: { hideBelowLg: true },
        cell: ({ row }) =>
          row.original.ownerKeycloakId === null ? (
            <span className="text-ink-muted">Company-wide</span>
          ) : row.original.ownerKeycloakId === identity.subject ? (
            <span className="text-ink">You</span>
          ) : (
            // The record holds a Keycloak subject and no name — the shared
            // resolver supplies one; where it cannot, the subject still shows.
            <PersonCell
              resolution={people.current.byKeycloakId(row.original.ownerKeycloakId)}
              fallback={row.original.ownerKeycloakId}
            />
          ),
      },
      {
        id: 'type',
        header: 'Type',
        meta: { hideBelowLg: true },
        cell: ({ row }) => contentTypeLabel(row.original.contentType),
      },
      {
        id: 'sizeBytes',
        header: 'Size',
        meta: { ...documentSort('sizeBytes'), align: 'right', priority: true },
        cell: ({ row }) => formatBytes(row.original.sizeBytes),
      },
      {
        id: 'createdAt',
        header: 'Added',
        meta: { ...documentSort('createdAt'), priority: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatDateTime(row.original.createdAt)}</span>
        ),
      },
    ],
    [identity.subject, people],
  );

  const categoryOptions = (categories.data ?? []).map((category) => ({
    value: category.id,
    label: category.sensitive ? `${category.name} (sensitive)` : category.name,
  }));

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={description}
        actions={
          manage ? (
            <Button onClick={openUpload} disabled={categories.isPending}>
              <Upload aria-hidden="true" />
              Upload document
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        <FilterBar onClear={clearFilters} isFiltered={isFiltered}>
          <SearchField
            value={search}
            onChange={setSearch}
            label="Search documents"
            placeholder="Search titles, descriptions and filenames"
          />
          {canReadCatalogue ? (
            <FilterSelect
              label="Category"
              anyLabel="Any category"
              value={filters.categoryId}
              onChange={(value) => setFilter('categoryId', value)}
              options={categoryOptions}
            />
          ) : null}
          <FilterSelect
            label="Owner"
            anyLabel="Anyone"
            value={filters.owner}
            onChange={(value) => setFilter('owner', value)}
            options={OWNER_OPTIONS}
          />
        </FilterBar>

        {canReadCatalogue ? null : (
          <p className="text-caption text-ink-muted">
            Filtering by category is not offered here: the category catalogue is an HR and admin
            endpoint, so this page cannot turn a category name into the id the filter needs. Search
            covers titles, descriptions and stored filenames.
          </p>
        )}

        {categories.error && canReadCatalogue ? (
          <Alert tone="warning" title="The category filter is unavailable">
            <p>
              The category catalogue could not be loaded, so filtering by category is off for now.
              The document list below is unaffected.
            </p>
          </Alert>
        ) : null}

        <DataTable
          caption={`${title} — ${manage ? 'all documents you administer' : 'documents you can access'}`}
          columns={columns}
          page={query.data}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          error={query.error}
          onRetry={() => void query.refetch()}
          sort={sort}
          onSortChange={setSort}
          onPageChange={setPage}
          label="documents"
          isFiltered={isFiltered}
          rowId={(row) => row.id}
          cardTitle={(row) => row.title}
          rowActions={(row) => (
            <>
              <FileDownloadAction document={row} variant="icon" />
              {manage ? (
                <>
                  <IconButton
                    size="compact"
                    label={`Edit details of ${row.title}`}
                    onClick={() => openEdit(row)}
                  >
                    <Pencil aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    size="compact"
                    label={`Delete ${row.title}`}
                    onClick={() => askDelete(row)}
                  >
                    <Trash2 aria-hidden="true" />
                  </IconButton>
                </>
              ) : null}
            </>
          )}
          emptyState={
            manage ? (
              <EmptyState
                icon={Upload}
                title="No documents yet"
                description="Upload the first document. The category you file it under decides who can read it."
                action={<Button onClick={openUpload}>Upload document</Button>}
              />
            ) : (
              <EmptyState
                icon={FileText}
                title="No documents are shared with you"
                description="Company-wide documents and anything filed to your account will appear here. An empty library is normal — it does not mean something failed."
              />
            )
          }
          noMatchesState={
            <EmptyState
              icon={SearchX}
              title="No documents match these filters"
              description="Documents exist that you can reach — none of them match what you asked for. Clear the filters to see them."
            />
          }
        />
      </div>

      <DocumentDetailsDialog
        document={viewing}
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      />

      {manage ? (
        <>
          <DocumentFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            document={editing}
            categories={categories.data ?? []}
            categoriesError={categories.error}
          />

          <ConfirmActionDialog
            open={confirmation.open}
            onOpenChange={(next) => {
              confirmation.onOpenChange(next);
              if (!next) setPendingDelete(null);
            }}
            title={`Delete ${pendingDelete?.title ?? 'this document'}?`}
            description={
              <>
                This deletes the record{' '}
                <strong className="text-ink-strong">{pendingDelete?.title}</strong> from the
                library.
              </>
            }
            consequences={[
              'The stored file is deleted with it — the bytes are removed from the blob store, not just unlinked.',
              'Anyone who could reach the document loses it immediately.',
              'The audit trail keeps the record of every past download; deletion cannot be undone.',
            ]}
            confirmLabel="Delete document"
            destructive
            busy={remove.isPending}
            error={confirmation.error}
            onConfirm={() => void confirmDelete()}
          />
        </>
      ) : null}
    </PageContainer>
  );
}
