import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiClient } from '@/shared/api';
import type { AuthProbeResponse, EmployeeProfileResponse } from '@/shared/types/hr';

/**
 * Self-service profile (P13).
 *
 * `GET /api/hr/me` resolves the caller from `jwt.sub` — there is no id in the
 * path or the query, so no caller can widen it to somebody else's record. That
 * is a backend guarantee (`MeController`), and it is why this feature exposes no
 * "profile by id": such a route would exist only to be tampered with.
 *
 * A **404 is a legitimate state, not a failure**: identity onboarding has not
 * linked an employee record to this login account yet. The page says so; it does
 * not render an error.
 */

export const profileKeys = {
  all: ['profile'] as const,
  me: () => [...profileKeys.all, 'me'] as const,
  access: () => [...profileKeys.all, 'access'] as const,
};

async function fetchMyProfile(signal: AbortSignal): Promise<EmployeeProfileResponse> {
  const { data } = await apiClient.get<EmployeeProfileResponse>('/api/hr/me', { signal });
  return data;
}

async function fetchAccess(signal: AbortSignal): Promise<AuthProbeResponse> {
  const { data } = await apiClient.get<AuthProbeResponse>('/api/hr/auth/me', { signal });
  return data;
}

/** The caller's own HR record, with department/position/manager already resolved. */
export function useMyProfileQuery(): UseQueryResult<EmployeeProfileResponse> {
  return useQuery({
    queryKey: profileKeys.me(),
    queryFn: ({ signal }) => fetchMyProfile(signal),
    // An HR record changes rarely and never because of anything the user does
    // on this page.
    staleTime: 5 * 60_000,
  });
}

/**
 * The server's view of this token: subject, issuer, audience and the authorities
 * it actually grants. Shown beside the profile so "what the server thinks I am"
 * is inspectable rather than folklore — the SPA's own role list is decoded from
 * the token for display and is never the authority.
 */
export function useAccessQuery(): UseQueryResult<AuthProbeResponse> {
  return useQuery({
    queryKey: profileKeys.access(),
    queryFn: ({ signal }) => fetchAccess(signal),
    staleTime: 5 * 60_000,
  });
}
