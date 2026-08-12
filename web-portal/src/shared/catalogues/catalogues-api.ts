import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiClient, toPageParams, type PageResponse } from '@/shared/api';
import type { DepartmentResponse, PositionResponse } from '@/shared/types/hr';

/**
 * The department and position catalogues as REFERENCE DATA — the lookup every
 * HR surface needs to turn `EmployeeResponse`'s raw UUIDs into words.
 *
 * Why this lives in `shared/` rather than in the `organization` feature: three
 * different surfaces read it (the employee directory's columns and filters, the
 * employee form's selects, the employee detail profile panel) and the feature
 * that OWNS the writes is a fourth. A feature may not import another feature
 * (FRONTEND-ARCHITECTURE §14), and giving each consumer its own copy would give
 * one endpoint several cache keys — so creating a department would leave the
 * employee form offering a list that no longer matches the server. Cross-feature
 * reuse is promoted to `shared/` first; this is that promotion, and the ≥2-real-
 * consumers bar is met several times over.
 *
 * This is the *lookup* read model only. The paged, sorted, searched list behind
 * the admin tables is a different shape with a different cache tier and belongs
 * to `features/organization`, which invalidates these keys after every write.
 *
 * Verified against `DepartmentController` / `PositionController`:
 *   GET /api/hr/departments   HR+ADMIN · sort name|createdAt|updatedAt · size ≤200
 *   GET /api/hr/positions     HR+ADMIN · sort title|createdAt|updatedAt · size ≤200
 */

/** `MAX_PAGE_SIZE` on both controllers. One request holds the whole catalogue. */
export const CATALOGUE_PAGE_SIZE = 200;

export const catalogueKeys = {
  all: ['catalogues'] as const,
  departments: () => [...catalogueKeys.all, 'departments'] as const,
  positions: () => [...catalogueKeys.all, 'positions'] as const,
};

/**
 * A whole catalogue, plus the fact of whether it really is whole.
 *
 * `truncated` exists because the server clamps to 200 and the SPA must not
 * pretend otherwise: a picker that silently omits the 201st department would
 * make an assignment look impossible rather than unsupported.
 */
export interface Catalogue<T> {
  items: T[];
  byId: Map<string, T>;
  /** What the server says exists, from the envelope — not `items.length`. */
  totalElements: number;
  /** The catalogue is larger than one clamped page can carry. */
  truncated: boolean;
}

function toCatalogue<T extends { id: string }>(page: PageResponse<T>): Catalogue<T> {
  return {
    items: page.content,
    byId: new Map(page.content.map((item) => [item.id, item])),
    totalElements: page.totalElements,
    truncated: page.totalElements > page.content.length,
  };
}

async function fetchCatalogue<T extends { id: string }>(
  path: string,
  sort: string,
  signal: AbortSignal,
): Promise<Catalogue<T>> {
  const { data } = await apiClient.get<PageResponse<T>>(path, {
    signal,
    params: toPageParams({ page: 0, size: CATALOGUE_PAGE_SIZE, sort }),
  });
  return toCatalogue(data);
}

/** Catalogue tier: 30 minutes (FRONTEND-ARCHITECTURE §6). */
const CATALOGUE_STALE_TIME = 30 * 60_000;

export function useDepartmentCatalogueQuery(): UseQueryResult<Catalogue<DepartmentResponse>> {
  return useQuery({
    queryKey: catalogueKeys.departments(),
    queryFn: ({ signal }) =>
      fetchCatalogue<DepartmentResponse>('/api/hr/departments', 'name,asc', signal),
    staleTime: CATALOGUE_STALE_TIME,
  });
}

export function usePositionCatalogueQuery(): UseQueryResult<Catalogue<PositionResponse>> {
  return useQuery({
    queryKey: catalogueKeys.positions(),
    queryFn: ({ signal }) =>
      fetchCatalogue<PositionResponse>('/api/hr/positions', 'title,asc', signal),
    staleTime: CATALOGUE_STALE_TIME,
  });
}

/**
 * The label for a catalogue id, or `null` when the catalogue has not resolved
 * (or genuinely lacks the entry). Callers render their own placeholder: a
 * missing label while loading and a dangling reference are different facts, and
 * neither is "—" invented as a value.
 */
export function catalogueLabel<T extends { id: string }>(
  catalogue: Catalogue<T> | undefined,
  id: string | null,
  label: (entry: T) => string,
): string | null {
  if (!id || !catalogue) return null;
  const entry = catalogue.byId.get(id);
  return entry ? label(entry) : null;
}
