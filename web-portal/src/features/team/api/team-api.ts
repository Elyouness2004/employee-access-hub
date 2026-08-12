import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiClient, toPageParams, type PageResponse } from '@/shared/api';
import type { EmployeeProfileResponse, EmployeeStatus } from '@/shared/types/hr';

/**
 * Manager team roster (P15) — `GET /api/hr/me/team`.
 *
 * The manager is resolved from `jwt.sub` inside `MeController`; there is no
 * `managerId` parameter and the UI must never invent one. What comes back is the
 * caller's DIRECT reports only — the backend has no recursive query, so the page
 * must not imply an org tree.
 *
 * Verified constraints (MeController + api-conventions §1):
 *   role      MANAGER only (HR/ADMIN without it receive 403)
 *   filters   status, departmentId, positionId, search
 *   sortable  matricule, firstName, lastName, email, hireDate, status, createdAt
 *   size      clamped to 100, default 20; default sort matricule ascending
 */

/**
 * Sortable columns, transcribed from `MeController.SORTABLE`. The server drops
 * anything else silently, so a sort affordance outside this list would look
 * broken with no way for the user to tell.
 */
export const TEAM_SORTABLE = [
  'matricule',
  'firstName',
  'lastName',
  'email',
  'hireDate',
  'status',
  'createdAt',
] as const;

export type TeamSortKey = (typeof TEAM_SORTABLE)[number];

/** `@PageableDefault(size = 20, sort = "matricule")`. */
export const TEAM_DEFAULT_SORT = 'matricule,asc';
export const TEAM_PAGE_SIZE = 20;

export interface TeamQueryParams {
  page: number;
  sort: string | undefined;
  search: string;
  status: string | undefined;
}

export const teamKeys = {
  all: ['team'] as const,
  list: (params: TeamQueryParams) => [...teamKeys.all, 'list', params] as const,
};

export function useTeamQuery(
  params: TeamQueryParams,
): UseQueryResult<PageResponse<EmployeeProfileResponse>> {
  return useQuery({
    queryKey: teamKeys.list(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<EmployeeProfileResponse>>(
        '/api/hr/me/team',
        {
          signal,
          params: {
            ...toPageParams({
              page: params.page,
              size: TEAM_PAGE_SIZE,
              sort: params.sort ?? TEAM_DEFAULT_SORT,
              search: params.search,
            }),
            ...(params.status ? { status: params.status as EmployeeStatus } : {}),
          },
        },
      );
      return data;
    },
    // Directory-shaped data: 1 minute (FRONTEND-ARCHITECTURE §6).
    staleTime: 60_000,
    // Paging and filtering keep the previous page on screen instead of
    // flashing a skeleton over data the user is still reading.
    placeholderData: keepPreviousData,
  });
}
