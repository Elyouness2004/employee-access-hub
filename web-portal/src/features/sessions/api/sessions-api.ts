import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiClient } from '@/shared/api';
import type { LogoutOthersResponse, SessionResponse } from '@/shared/types/hr';

/**
 * My sessions (P11) — `SessionController`.
 *
 *   GET    /api/hr/sessions                  my active sessions (UNPAGED — see below)
 *   DELETE /api/hr/sessions/{id}             terminate one; `confirmCurrent=true`
 *                                            required for the session you are using
 *   POST   /api/hr/sessions/logout-others    end every other session
 *
 * **Deliberately unpaged** (api-conventions §1): this is a person's device list
 * sourced live from Keycloak, not a collection. Faking pagination over it would
 * imply a scale that does not exist.
 *
 * `mfaUsed` reads from the `acr`/`amr` claims and is `false` throughout today —
 * MFA is not implemented in the realm (backend P3.5). That is the platform's
 * real state, and the UI says so rather than hiding the field or implying it is
 * broken.
 */

export const sessionKeys = {
  all: ['sessions'] as const,
  mine: () => [...sessionKeys.all, 'mine'] as const,
};

export function useMySessionsQuery(): UseQueryResult<SessionResponse[]> {
  return useQuery({
    queryKey: sessionKeys.mine(),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<SessionResponse[]>('/api/hr/sessions', { signal });
      return data;
    },
    // Security-relevant and cheap: never serve a stale device list silently.
    staleTime: 0,
  });
}

export interface TerminateSessionInput {
  sessionId: string;
  /**
   * Required to end the session you are signed in with. Without it the server
   * answers 409 `Confirmation required` — a guard against ending your own
   * session by mis-clicking, not a validation error.
   */
  confirmCurrent?: boolean;
}

export function useTerminateSessionMutation(): UseMutationResult<
  void,
  unknown,
  TerminateSessionInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, confirmCurrent }: TerminateSessionInput) => {
      await apiClient.delete(`/api/hr/sessions/${sessionId}`, {
        ...(confirmCurrent ? { params: { confirmCurrent: true } } : {}),
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}

export function useLogoutOthersMutation(): UseMutationResult<LogoutOthersResponse, unknown, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<LogoutOthersResponse>('/api/hr/sessions/logout-others');
      return data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
