import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { env } from '@/config/env';
import { apiClient, fetchBinary, saveBlob, toPageParams, type PageResponse } from '@/shared/api';
import type {
  DocumentCategoryRequest,
  DocumentCategoryResponse,
  DocumentMetadataRequest,
  DocumentResponse,
} from '@/shared/types/documents';

import { CONTENT_TYPE_LABELS } from '../content-types';

/**
 * The documents surface (P10 library · P22 admin · P25 categories), verified
 * against `DocumentController` and `DocumentCategoryController`.
 *
 *   GET    /api/documents                 EMPLOYEE+ · per-document FR-41 scope in SQL
 *                                         · filters categoryId, ownerKeycloakId · search
 *                                         · sort title|createdAt|updatedAt|sizeBytes · size ≤200
 *   GET    /api/documents/{id}            EMPLOYEE+ · FR-41
 *   GET    /api/documents/{id}/content    EMPLOYEE+ · bytes, audited · 404 = no stored bytes
 *   POST   /api/documents (multipart)     HR+ADMIN  · parts: file + metadata(JSON)
 *   PUT    /api/documents/{id}/metadata   HR+ADMIN  · leaves the stored file untouched
 *   DELETE /api/documents/{id}            HR+ADMIN  · removes the record AND the bytes
 *   GET    /api/documents/categories      HR+ADMIN  · sort name|minRole|createdAt|updatedAt
 *   POST/PUT/DELETE .../categories        ADMIN only
 *
 * **Two endpoints this SPA deliberately does not call.**
 * `GET /{id}/download` answers with the `storageKey`, and `POST` / `PUT` in
 * their JSON form take one. A storage key is a server-generated pointer into
 * the blob store: the UI must never display it, and it must never construct or
 * edit one. `/content` gives the same bytes with the same audit entry and
 * nothing to leak, so it is the only download path here. The JSON registration
 * routes stay available for HR tooling, outside this client.
 */

/** `DocumentController.SORTABLE`, transcribed. Anything else the server drops. */
export const DOCUMENT_SORTABLE = ['title', 'createdAt', 'updatedAt', 'sizeBytes'] as const;
export type DocumentSortKey = (typeof DOCUMENT_SORTABLE)[number];
/** `@PageableDefault(sort = "createdAt", direction = DESC)`. */
export const DOCUMENT_DEFAULT_SORT = 'createdAt,desc';
export const DOCUMENT_LIST_PAGE_SIZE = 20;

/** `DocumentCategoryController.SORTABLE` + `@PageableDefault(sort = "name")`. */
export const CATEGORY_SORTABLE = ['name', 'minRole', 'createdAt', 'updatedAt'] as const;
export type CategorySortKey = (typeof CATEGORY_SORTABLE)[number];
export const CATEGORY_DEFAULT_SORT = 'name,asc';

/**
 * Column meta for a sortable column, typed to the whitelist.
 *
 * The whitelist is not documentation: the server **silently drops** a sort on
 * anything outside it, so a column that offers a sort the server ignores looks
 * like a bug the user cannot report. Routing every sort affordance through
 * these helpers turns a typo or an invented column into a compile error rather
 * than a header that does nothing.
 */
export function documentSort(key: DocumentSortKey): { sortKey: string } {
  return { sortKey: key };
}

export function categorySort(key: CategorySortKey): { sortKey: string } {
  return { sortKey: key };
}
/**
 * The category picker needs the whole (small) catalogue, not a page of it. 200
 * is the endpoint's own clamp, so this asks for the most it will ever give
 * rather than inventing a limit of its own.
 */
export const CATEGORY_MAX_PAGE_SIZE = 200;

/** `@Size` on `DocumentMetadataRequest` / `CategoryRequest`. */
export const DOCUMENT_TITLE_MAX = 200;
export const DOCUMENT_DESCRIPTION_MAX = 500;
export const CATEGORY_NAME_MAX = 100;
export const CATEGORY_DESCRIPTION_MAX = 500;

export interface DocumentListParams {
  page: number;
  sort: string | undefined;
  search: string;
  categoryId: string | undefined;
  /** A Keycloak subject — never an employeeId (FRONTEND-ARCHITECTURE §13). */
  ownerKeycloakId: string | undefined;
}

export interface CategoryListParams {
  page: number;
  sort: string | undefined;
  search: string;
}

export const documentKeys = {
  all: ['documents'] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (params: DocumentListParams) => [...documentKeys.lists(), params] as const,
  detail: (id: string) => [...documentKeys.all, 'detail', id] as const,
  categories: () => [...documentKeys.all, 'categories'] as const,
  categoryLookup: () => [...documentKeys.categories(), 'lookup'] as const,
  categoryList: (params: CategoryListParams) => [...documentKeys.categories(), params] as const,
};

// ── Reading ────────────────────────────────────────────────────────────────

export function useDocumentListQuery(
  params: DocumentListParams,
): UseQueryResult<PageResponse<DocumentResponse>> {
  return useQuery({
    queryKey: documentKeys.list(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<DocumentResponse>>('/api/documents', {
        signal,
        params: {
          ...toPageParams({
            page: params.page,
            size: DOCUMENT_LIST_PAGE_SIZE,
            sort: params.sort ?? DOCUMENT_DEFAULT_SORT,
            search: params.search,
          }),
          // Only send a filter that is set: an empty value would narrow the
          // scope to "documents owned by nobody", not widen it back.
          ...(params.categoryId ? { categoryId: params.categoryId } : {}),
          ...(params.ownerKeycloakId ? { ownerKeycloakId: params.ownerKeycloakId } : {}),
        },
      });
      return data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * The category catalogue as a lookup (upload form, category filter).
 *
 * `GET /api/documents/categories` is annotated `hasAnyRole('HR','ADMIN')`, so an
 * EMPLOYEE or MANAGER gets 403. `enabled` keeps the request from being made at
 * all for them — a call certain to be denied is noise in the audit trail and in
 * the console, and the surfaces that need this list are HR/ADMIN surfaces
 * anyway. Callers must pass the role check, not assume it.
 */
export function useDocumentCategoryLookupQuery(
  enabled: boolean,
): UseQueryResult<DocumentCategoryResponse[]> {
  return useQuery({
    queryKey: documentKeys.categoryLookup(),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<DocumentCategoryResponse>>(
        '/api/documents/categories',
        {
          signal,
          params: toPageParams({
            page: 0,
            size: CATEGORY_MAX_PAGE_SIZE,
            sort: CATEGORY_DEFAULT_SORT,
          }),
        },
      );
      return data.content;
    },
    enabled,
    // Lookup tier (FRONTEND-ARCHITECTURE §6): categories change rarely and are
    // read by the filter bar, the upload form and the edit form.
    staleTime: 30 * 60_000,
  });
}

/** P25's own paged view of the catalogue — the admin screen, not the lookup. */
export function useDocumentCategoryListQuery(
  params: CategoryListParams,
): UseQueryResult<PageResponse<DocumentCategoryResponse>> {
  return useQuery({
    queryKey: documentKeys.categoryList(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<DocumentCategoryResponse>>(
        '/api/documents/categories',
        {
          signal,
          params: toPageParams({
            page: params.page,
            size: DOCUMENT_LIST_PAGE_SIZE,
            sort: params.sort ?? CATEGORY_DEFAULT_SORT,
            search: params.search,
          }),
        },
      );
      return data;
    },
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

// ── Download ───────────────────────────────────────────────────────────────

/**
 * Stream a document's bytes and hand them to the browser.
 *
 * Not a mutation and not a query: it is an imperative action with no cached
 * result, and caching a Blob would pin the whole file in memory. The filename
 * comes from `Content-Disposition` — the gateway exposes that header through
 * CORS exactly so this client can name the file the way the server named it;
 * `title` is only the fallback when the header is missing.
 *
 * A `404` here means the record holds no stored bytes (a metadata-only
 * registration). The caller renders that as a state, not as a failure.
 */
export async function downloadDocumentContent(document: DocumentResponse): Promise<void> {
  const binary = await fetchBinary(`/api/documents/${document.id}/content`, {
    fallbackFilename: document.title,
  });
  saveBlob(binary);
}

// ── Writing (HR/ADMIN) ─────────────────────────────────────────────────────

export interface UploadDocumentInput {
  metadata: DocumentMetadataRequest;
  file: File;
  /**
   * Real bytes-sent progress from the XHR, 0–100, or `undefined` while the
   * total length is unknown. Never synthesised: a progress bar that moves on a
   * timer is a lie about how much of the file has left the machine.
   */
  onProgress?: (percent: number | undefined) => void;
}

/**
 * Multipart upload — `POST /api/documents` with a `file` part and a JSON
 * `metadata` part.
 *
 * The metadata part is appended as a `Blob` typed `application/json` because
 * that is what makes Spring's `@RequestPart("metadata") DocumentMetadataRequest`
 * deserialize; a plain string part arrives as `text/plain` and the request
 * fails as malformed. `Content-Type` is left unset on the request itself so the
 * browser writes the multipart boundary.
 */
export function useUploadDocumentMutation(): UseMutationResult<
  DocumentResponse,
  unknown,
  UploadDocumentInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ metadata, file, onProgress }: UploadDocumentInput) => {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      const { data } = await apiClient.post<DocumentResponse>('/api/documents', form, {
        onUploadProgress: onProgress
          ? (event) =>
              onProgress(event.total ? Math.round((event.loaded / event.total) * 100) : undefined)
          : undefined,
        // A 10 MB file over a slow link outlasts the client's default 30s.
        timeout: 0,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
    },
  });
}

export interface UpdateDocumentMetadataInput {
  id: string;
  metadata: DocumentMetadataRequest;
}

/** Metadata-only edit: `PUT /{id}/metadata` leaves the stored file untouched. */
export function useUpdateDocumentMetadataMutation(): UseMutationResult<
  DocumentResponse,
  unknown,
  UpdateDocumentMetadataInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, metadata }: UpdateDocumentMetadataInput) => {
      const { data } = await apiClient.put<DocumentResponse>(
        `/api/documents/${id}/metadata`,
        metadata,
      );
      return data;
    },
    onSuccess: (document) => {
      void queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: documentKeys.detail(document.id) });
    },
  });
}

/** Delete — removes the record **and** the bytes. Never optimistic. */
export function useDeleteDocumentMutation(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/documents/${id}`);
    },
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
      queryClient.removeQueries({ queryKey: documentKeys.detail(id) });
    },
  });
}

// ── Categories (ADMIN) ─────────────────────────────────────────────────────

export interface SaveCategoryInput {
  /** Absent on create. */
  id?: string;
  body: DocumentCategoryRequest;
}

export function useSaveDocumentCategoryMutation(): UseMutationResult<
  DocumentCategoryResponse,
  unknown,
  SaveCategoryInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: SaveCategoryInput) => {
      const { data } = id
        ? await apiClient.put<DocumentCategoryResponse>(`/api/documents/categories/${id}`, body)
        : await apiClient.post<DocumentCategoryResponse>('/api/documents/categories', body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentKeys.categories() });
      // A renamed or re-tiered category changes what every document row says
      // about itself (`categoryName`, `sensitive` are resolved server-side).
      void queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
    },
  });
}

/** Delete a category. `409 Conflict` means documents still reference it. */
export function useDeleteDocumentCategoryMutation(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/documents/categories/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentKeys.categories() });
      void queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
    },
  });
}

// ── Upload policy (mirrored config, not an endpoint) ───────────────────────

/**
 * What this deployment accepts, as `config/env.ts` mirrors it from
 * `hub.documents.storage.*`. documents-service publishes the policy nowhere, so
 * the UI cannot ask — it can only be told, and it says so where it shows the
 * limits.
 *
 * Used to state the rules BEFORE a file is chosen and to reject an obviously
 * doomed selection without spending the upload. The server's 413/415 remains
 * the only verdict that counts.
 */
export const uploadPolicy = {
  maxFileSizeBytes: env.documentMaxFileSizeBytes,
  allowedContentTypes: env.documentAllowedContentTypes,
} as const;

/**
 * Human file size, **1024-based** — deliberately, because that is the base
 * Spring's `DataSize` uses to read `hub.documents.storage.max-file-size: 10MB`.
 * Formatting the same 10 485 760 bytes in SI units would print "10.5 MB" for a
 * limit the deployment calls 10 MB, so the UI would advertise a ceiling the
 * configuration does not name.
 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * The extension list the file picker offers, derived from the MIME allowlist.
 * `accept` is a courtesy hint only — a picker can always be overridden, and the
 * server is what actually enforces the allowlist.
 */
export function acceptAttribute(): string {
  return uploadPolicy.allowedContentTypes.join(',');
}

/** Human names for the allowlisted MIME types, in the configured order. */
export function describeAllowedTypes(): string {
  const labels = uploadPolicy.allowedContentTypes.map((type) => CONTENT_TYPE_LABELS[type] ?? type);
  return [...new Set(labels)].join(', ');
}

/** Mirrors `DocumentUploadPolicy.normalise` — media type without parameters. */
function normalizeContentType(type: string): string {
  const parameters = type.indexOf(';');
  return (parameters < 0 ? type : type.slice(0, parameters)).trim().toLowerCase();
}

/**
 * The courtesy pre-check, in the same order the server applies it (empty →
 * size → type), so a user never fixes the second problem to discover the first.
 *
 * It can legitimately be WRONG — a deployment may have retuned
 * `hub.documents.storage.*` without the mirrored `VITE_*` following — which is
 * why nothing depends on it being right: it saves a doomed upload, and the
 * server's 413/415 is the verdict either way.
 */
export function precheckFile(file: File): string | null {
  if (file.size <= 0) {
    return 'That file is empty. The server stores nothing for a zero-byte upload.';
  }
  if (file.size > uploadPolicy.maxFileSizeBytes) {
    return `That file is ${formatBytes(file.size)}. This deployment accepts up to ${formatBytes(
      uploadPolicy.maxFileSizeBytes,
    )}.`;
  }
  const type = normalizeContentType(file.type);
  if (!uploadPolicy.allowedContentTypes.includes(type)) {
    return `${type || 'That file type'} is not on this deployment's allowlist. Accepted: ${describeAllowedTypes()}.`;
  }
  return null;
}
