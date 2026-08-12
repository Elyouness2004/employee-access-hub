import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiClient, toPageParams, type PageResponse } from '@/shared/api';
import type {
  EmployeeRequest,
  EmployeeResponse,
  EmployeeStatus,
  ProvisioningStatus,
} from '@/shared/types/hr';

/**
 * The HR employee directory and record (P16, and the Profile tab of P17).
 *
 * Verified against `EmployeeController` and `EmployeeService`:
 *
 *   GET    /api/hr/employees        HR+ADMIN · filters status, provisioningStatus,
 *                                   departmentId, positionId, managerId · search over
 *                                   matricule/firstName/lastName/email · size ≤200
 *   GET    /api/hr/employees/{id}   404 unknown id
 *   POST   /api/hr/employees        201 · 400 field errors · 409 duplicate matricule or
 *                                   email · 422 unknown department/position/manager
 *   PUT    /api/hr/employees/{id}   same, plus 422 "an employee cannot be their own manager"
 *   DELETE /api/hr/employees/{id}   204 · 409 while they manage direct reports
 *
 * Two facts shape everything built on top:
 *
 *  1. **`EmployeeResponse` carries no `provisioningStatus`.** The endpoint
 *     accepts it as a filter and as a sort column, but does not return it per
 *     row. The directory can therefore narrow by provisioning state and cannot
 *     display it; what it can state is whether a login account is linked at all
 *     (`keycloakId`), which is exactly `Employee.isProvisioned()`.
 *  2. **Provisioning is asynchronous.** Creating (or reactivating) an ACTIVE
 *     employee publishes `EmployeeProvisioningRequested`, which
 *     `EmployeeLifecycleListener` handles AFTER_COMMIT and whose failures it
 *     catches and logs. So a create NEVER answers 502 — it answers 201 with
 *     `keycloakId: null`, and the outcome lands in the provisioning journal.
 *     The UI must say that rather than imply the account already exists.
 */

/** `EmployeeController.SORTABLE`; the server silently drops anything else. */
export const EMPLOYEE_SORTABLE = [
  'matricule',
  'firstName',
  'lastName',
  'email',
  'hireDate',
  'status',
  'provisioningStatus',
  'createdAt',
  'updatedAt',
] as const;

/** `@PageableDefault(size = 20, sort = "matricule")`. */
export const EMPLOYEE_DEFAULT_SORT = 'matricule,asc';
export const EMPLOYEE_PAGE_SIZE = 20;

/** Bean Validation sizes on `EmployeeRequest`. */
export const EMPLOYEE_MATRICULE_MAX = 32;
export const EMPLOYEE_NAME_MAX = 100;
export const EMPLOYEE_EMAIL_MAX = 255;

/** The filter keys `EmployeeController` accepts — the UI offers no others. */
export interface EmployeeListParams {
  page: number;
  sort: string | undefined;
  search: string;
  status: string | undefined;
  provisioningStatus: string | undefined;
  departmentId: string | undefined;
  positionId: string | undefined;
  managerId: string | undefined;
}

export const employeeKeys = {
  all: ['employees'] as const,
  list: (params: EmployeeListParams) => [...employeeKeys.all, 'list', params] as const,
  listAll: () => [...employeeKeys.all, 'list'] as const,
  detail: (employeeId: string) => [...employeeKeys.all, 'detail', employeeId] as const,
  /** The picker's own short searches — a different shape from the directory list. */
  search: (term: string) => [...employeeKeys.searchAll(), term] as const,
  searchAll: () => [...employeeKeys.all, 'search'] as const,
};

function listParams(params: EmployeeListParams) {
  return {
    ...toPageParams({
      page: params.page,
      size: EMPLOYEE_PAGE_SIZE,
      sort: params.sort ?? EMPLOYEE_DEFAULT_SORT,
      search: params.search,
    }),
    ...(params.status ? { status: params.status as EmployeeStatus } : {}),
    ...(params.provisioningStatus
      ? { provisioningStatus: params.provisioningStatus as ProvisioningStatus }
      : {}),
    ...(params.departmentId ? { departmentId: params.departmentId } : {}),
    ...(params.positionId ? { positionId: params.positionId } : {}),
    ...(params.managerId ? { managerId: params.managerId } : {}),
  };
}

export function useEmployeeListQuery(
  params: EmployeeListParams,
): UseQueryResult<PageResponse<EmployeeResponse>> {
  return useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<EmployeeResponse>>('/api/hr/employees', {
        signal,
        params: listParams(params),
      });
      return data;
    },
    // Directory tier: 1 minute (FRONTEND-ARCHITECTURE §6).
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useEmployeeQuery(
  employeeId: string,
  options: { enabled?: boolean } = {},
): UseQueryResult<EmployeeResponse> {
  return useQuery({
    queryKey: employeeKeys.detail(employeeId),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<EmployeeResponse>(`/api/hr/employees/${employeeId}`, {
        signal,
      });
      return data;
    },
    staleTime: 60_000,
    enabled: options.enabled ?? true,
  });
}

/**
 * A short, searchable slice of the directory for the manager picker.
 *
 * Deliberately a separate key from the directory list: it is a different
 * request (10 rows, no filters) and caching it under the directory's key would
 * make one screen's paging clobber the other's results.
 */
export function useEmployeeSearchQuery(
  term: string,
  options: { enabled?: boolean } = {},
): UseQueryResult<PageResponse<EmployeeResponse>> {
  return useQuery({
    queryKey: employeeKeys.search(term),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<EmployeeResponse>>('/api/hr/employees', {
        signal,
        params: toPageParams({
          page: 0,
          size: EMPLOYEE_PICKER_SIZE,
          sort: 'lastName,asc',
          search: term,
        }),
      });
      return data;
    },
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

/** How many candidates the manager picker shows before asking for a narrower search. */
export const EMPLOYEE_PICKER_SIZE = 10;

export interface EmployeeWrite extends EmployeeRequest {
  /** Absent on create. */
  id?: string;
}

/**
 * Create or update. **Never optimistic** — uniqueness (409), reference validity
 * (422) and the identity side effects all live on the server, and a row shown
 * before it exists is a row that may never exist.
 */
export function useSaveEmployeeMutation(): UseMutationResult<
  EmployeeResponse,
  unknown,
  EmployeeWrite
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: EmployeeWrite) => {
      const { data } = id
        ? await apiClient.put<EmployeeResponse>(`/api/hr/employees/${id}`, body)
        : await apiClient.post<EmployeeResponse>('/api/hr/employees', body);
      return data;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(employeeKeys.detail(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: employeeKeys.listAll() });
      // Every cached search term, not just the empty one — a rename has to
      // reach the picker results a user has already opened.
      void queryClient.invalidateQueries({ queryKey: employeeKeys.searchAll() });
    },
  });
}

/** Delete. `409` means they still manage direct reports — reassign those first. */
export function useDeleteEmployeeMutation(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      await apiClient.delete(`/api/hr/employees/${employeeId}`);
    },
    onSuccess: (_result, employeeId) => {
      queryClient.removeQueries({ queryKey: employeeKeys.detail(employeeId) });
      void queryClient.invalidateQueries({ queryKey: employeeKeys.listAll() });
    },
  });
}

/** Display name for an employee record — never a Keycloak subject. */
export function employeeName(employee: Pick<EmployeeResponse, 'firstName' | 'lastName'>): string {
  return `${employee.firstName} ${employee.lastName}`;
}
