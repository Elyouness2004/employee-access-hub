import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiClient, toPageParams, type PageResponse } from '@/shared/api';
import { catalogueKeys } from '@/shared/catalogues';
import type {
  DepartmentRequest,
  DepartmentResponse,
  PositionRequest,
  PositionResponse,
} from '@/shared/types/hr';

/**
 * The department and position catalogues as ADMIN SURFACES (P18, P19).
 *
 * `DepartmentController` and `PositionController` are the same controller twice:
 * same roles, same paging, same search, same conflict semantics — only the
 * label field differs (`name` vs `title`). So they are described here as data
 * rather than implemented twice, and one page component renders both. Two
 * hand-copied CRUD screens would be two places to fix every bug.
 *
 * Verified against the controllers and services:
 *   GET    /api/hr/{catalogue}        HR+ADMIN · search over label + description
 *                                     · sort {label}|createdAt|updatedAt · size ≤200
 *   POST   /api/hr/{catalogue}        409 when the label already exists (case-insensitive)
 *   PUT    /api/hr/{catalogue}/{id}   409 likewise, excluding itself · 404 unknown id
 *   DELETE /api/hr/{catalogue}/{id}   204 · 409 while employees are assigned
 *
 * There is NO hierarchy: `Department` has an id, a name and a description and
 * nothing else. The UI must not imply a parent/child tree the backend cannot
 * store.
 */

/** The two catalogues, described once. */
export type CatalogueKey = 'departments' | 'positions';

export interface CatalogueDescriptor {
  key: CatalogueKey;
  path: string;
  /** The name-bearing property on the DTO — and the 400 `errors` key. */
  labelField: 'name' | 'title';
  /** Sortable columns, transcribed from the controller's `SORTABLE` set. */
  sortable: readonly string[];
  /** `@PageableDefault(sort = …)`. */
  defaultSort: string;
  /** Copy: what one entry is called, and what many are called. */
  singular: string;
  plural: string;
  /** Column heading for the label field. */
  labelHeading: string;
  /** Which catalogue lookup key a write invalidates. */
  catalogueKey: () => readonly string[];
}

export const DEPARTMENTS: CatalogueDescriptor = {
  key: 'departments',
  path: '/api/hr/departments',
  labelField: 'name',
  sortable: ['name', 'createdAt', 'updatedAt'],
  defaultSort: 'name,asc',
  singular: 'department',
  plural: 'departments',
  labelHeading: 'Name',
  catalogueKey: catalogueKeys.departments,
};

export const POSITIONS: CatalogueDescriptor = {
  key: 'positions',
  path: '/api/hr/positions',
  labelField: 'title',
  sortable: ['title', 'createdAt', 'updatedAt'],
  defaultSort: 'title,asc',
  singular: 'position',
  plural: 'positions',
  labelHeading: 'Title',
  catalogueKey: catalogueKeys.positions,
};

/** `@PageableDefault(size = 20)`. */
export const CATALOGUE_LIST_PAGE_SIZE = 20;

/** `@Size(max = 100)` on the label, `@Size(max = 500)` on the description. */
export const CATALOGUE_LABEL_MAX = 100;
export const CATALOGUE_DESCRIPTION_MAX = 500;

export interface CatalogueListParams {
  page: number;
  sort: string | undefined;
  search: string;
}

export const organizationKeys = {
  all: ['organization'] as const,
  list: (catalogue: CatalogueKey, params: CatalogueListParams) =>
    [...organizationKeys.all, catalogue, 'list', params] as const,
  listAll: (catalogue: CatalogueKey) => [...organizationKeys.all, catalogue, 'list'] as const,
};

/**
 * One entry, normalized so a single table and a single form can serve both
 * catalogues. A frontend-only projection, hence the `View` suffix
 * (FRONTEND-ARCHITECTURE §13) — the DTO types stay untouched.
 */
export interface CatalogueEntryView {
  id: string;
  /** `name` on a department, `title` on a position. */
  label: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

function toView(
  entry: DepartmentResponse | PositionResponse,
  labelField: 'name' | 'title',
): CatalogueEntryView {
  return {
    id: entry.id,
    label:
      labelField === 'name'
        ? (entry as DepartmentResponse).name
        : (entry as PositionResponse).title,
    description: entry.description,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export function useCatalogueListQuery(
  catalogue: CatalogueDescriptor,
  params: CatalogueListParams,
): UseQueryResult<PageResponse<CatalogueEntryView>> {
  return useQuery({
    queryKey: organizationKeys.list(catalogue.key, params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<DepartmentResponse | PositionResponse>>(
        catalogue.path,
        {
          signal,
          params: toPageParams({
            page: params.page,
            size: CATALOGUE_LIST_PAGE_SIZE,
            sort: params.sort ?? catalogue.defaultSort,
            search: params.search,
          }),
        },
      );
      return { ...data, content: data.content.map((entry) => toView(entry, catalogue.labelField)) };
    },
    // Catalogue data changes rarely, but this is the screen where it is being
    // changed — the directory/team tier (1 minute) rather than the 30-minute
    // lookup tier, so an edit made in another tab surfaces reasonably soon.
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** The write body, built from the normalized form values. */
export interface CatalogueWrite {
  /** Absent on create. */
  id?: string;
  label: string;
  description: string | null;
}

function toRequest(
  write: CatalogueWrite,
  labelField: 'name' | 'title',
): DepartmentRequest | PositionRequest {
  return labelField === 'name'
    ? { name: write.label, description: write.description }
    : { title: write.label, description: write.description };
}

/**
 * Create or update. Never optimistic: the server owns uniqueness, and showing a
 * row that a 409 is about to reject would be inventing a catalogue entry.
 */
export function useSaveCatalogueEntryMutation(
  catalogue: CatalogueDescriptor,
): UseMutationResult<CatalogueEntryView, unknown, CatalogueWrite> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (write: CatalogueWrite) => {
      const body = toRequest(write, catalogue.labelField);
      const { data } = write.id
        ? await apiClient.put<DepartmentResponse | PositionResponse>(
            `${catalogue.path}/${write.id}`,
            body,
          )
        : await apiClient.post<DepartmentResponse | PositionResponse>(catalogue.path, body);
      return toView(data, catalogue.labelField);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.listAll(catalogue.key) });
      // The employee form and the directory read the same catalogue through a
      // different key; without this they would offer a list the server no
      // longer agrees with.
      void queryClient.invalidateQueries({ queryKey: catalogue.catalogueKey() });
    },
  });
}

/** Delete. `409 Conflict` means employees are still assigned — surfaced, not swallowed. */
export function useDeleteCatalogueEntryMutation(
  catalogue: CatalogueDescriptor,
): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`${catalogue.path}/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.listAll(catalogue.key) });
      void queryClient.invalidateQueries({ queryKey: catalogue.catalogueKey() });
    },
  });
}
