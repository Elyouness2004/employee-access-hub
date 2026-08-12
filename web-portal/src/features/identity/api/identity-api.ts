import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiClient } from '@/shared/api';
import type {
  OffboardingResponse,
  ProvisioningHistoryResponse,
  ProvisioningStatusResponse,
  SecurityEventResponse,
  SessionResponse,
} from '@/shared/types/hr';

/**
 * The administrative identity lifecycle (P17) — `/api/hr/admin/**`, HR + ADMIN.
 *
 * Transcribed from `AdminProvisioningController`. Eight of the nine actions
 * answer with `ProvisioningStatusResponse`; `offboard` answers with
 * `OffboardingResponse`, because its outcome is a fan-out, not a state.
 *
 *   POST /employees/{id}/provision        idempotent · adopts an existing Keycloak
 *                                          account for the same username · 502 when
 *                                          Keycloak rejects or the record is not
 *                                          ACTIVE · 503 when the provider is down
 *   POST /employees/{id}/reprovision      the same operation, for a FAILED record
 *   POST /employees/{id}/offboard         TERMINATED + disable + revoke + BR-05 fan-out
 *   POST /employees/{id}/reset-password   invalidates the credential, then Keycloak
 *                                          e-mails a password-setup action token
 *   POST /employees/{id}/require-mfa      Keycloak CONFIGURE_TOTP required action
 *   POST /employees/{id}/disable          status DISABLED, account disabled, sessions revoked
 *   POST /employees/{id}/reactivate       reverses a deactivation · 409 when TERMINATED
 *   POST /employees/{id}/lock             account disabled, status untouched · optional reason
 *   POST /employees/{id}/unlock           re-enables only while the record is ACTIVE
 *   POST /employees/{id}/sync-roles       recompute and push the derived realm role
 *   POST /employees/{id}/revoke-sessions  sessions + refresh tokens
 *
 *   GET  /employees/{id}/identity         current identity state (employment + account)
 *   GET  /employees/{id}/provisioning     unpaged journal, oldest first
 *   GET  /employees/{id}/security-events  unpaged, oldest first
 *   GET  /employees/{id}/sessions         live Keycloak sessions for that account
 *
 * **The constraint the UI is built around.** Seven actions require a linked
 * account: `SecurityAdminService.requireProvisioned` throws
 * `EmployeeNotProvisionedException` → **409 "Not provisioned"**, not a 403 and
 * not a 422. The UI hides those actions for an unlinked record rather than
 * offering a button whose only outcome is that conflict.
 *
 * Nothing here is optimistic. An identity action changes a real account in
 * Keycloak, and the SPA finding out afterwards that it did not is exactly the
 * case where a hopeful UI does damage.
 */

/** The status-returning actions, exactly as the controller names them. */
export type IdentityActionId =
  | 'provision'
  | 'reprovision'
  | 'reset-password'
  | 'require-mfa'
  | 'disable'
  | 'reactivate'
  | 'lock'
  | 'unlock'
  | 'sync-roles'
  | 'revoke-sessions';

export const identityKeys = {
  all: ['identity'] as const,
  employee: (employeeId: string) => [...identityKeys.all, employeeId] as const,
  /** Live identity state from `GET .../identity`; action responses seed it too. */
  status: (employeeId: string) => [...identityKeys.employee(employeeId), 'status'] as const,
  provisioning: (employeeId: string) =>
    [...identityKeys.employee(employeeId), 'provisioning'] as const,
  securityEvents: (employeeId: string) =>
    [...identityKeys.employee(employeeId), 'security-events'] as const,
  sessions: (employeeId: string) => [...identityKeys.employee(employeeId), 'sessions'] as const,
};

/**
 * The employee's provisioning journal. Unpaged by design (api-conventions §1:
 * "bounded by one employee") — no client-side paging is layered over it.
 */
export function useProvisioningHistoryQuery(
  employeeId: string,
  options: { enabled?: boolean } = {},
): UseQueryResult<ProvisioningHistoryResponse[]> {
  return useQuery({
    queryKey: identityKeys.provisioning(employeeId),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<ProvisioningHistoryResponse[]>(
        `/api/hr/admin/employees/${employeeId}/provisioning`,
        { signal },
      );
      return data;
    },
    // An investigation surface: what happened a moment ago matters.
    staleTime: 0,
    enabled: options.enabled ?? true,
  });
}

export function useSecurityEventsQuery(
  employeeId: string,
  options: { enabled?: boolean } = {},
): UseQueryResult<SecurityEventResponse[]> {
  return useQuery({
    queryKey: identityKeys.securityEvents(employeeId),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<SecurityEventResponse[]>(
        `/api/hr/admin/employees/${employeeId}/security-events`,
        { signal },
      );
      return data;
    },
    staleTime: 0,
    enabled: options.enabled ?? true,
  });
}

/** Live SSO sessions of one account. Unpaged: it comes from Keycloak, not a table. */
export function useEmployeeSessionsQuery(
  employeeId: string,
  options: { enabled?: boolean } = {},
): UseQueryResult<SessionResponse[]> {
  return useQuery({
    queryKey: identityKeys.sessions(employeeId),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<SessionResponse[]>(
        `/api/hr/admin/employees/${employeeId}/sessions`,
        { signal },
      );
      return data;
    },
    staleTime: 0,
    enabled: options.enabled ?? true,
  });
}

/**
 * The employee's current identity state: employment status and account state
 * together, straight from the server.
 *
 * Read live rather than inferred. The panel has to distinguish "no account
 * exists" from "the account is locked" from "the employee is terminated", and
 * those are the differences that decide which actions are even legal — guessing
 * them from the journal would put a wrong account state in front of an operator
 * about to lock somebody out.
 */
export function useIdentityStateQuery(
  employeeId: string,
  options: { enabled?: boolean } = {},
): UseQueryResult<ProvisioningStatusResponse> {
  return useQuery({
    queryKey: identityKeys.status(employeeId),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<ProvisioningStatusResponse>(
        `/api/hr/admin/employees/${employeeId}/identity`,
        { signal },
      );
      return data;
    },
    // An administrative surface acted on in real time: what it says now matters.
    staleTime: 0,
    enabled: options.enabled ?? true,
  });
}

export interface IdentityActionInput {
  employeeId: string;
  action: IdentityActionId;
  /** `LockRequest.reason` — accepted by `lock` only, and optional there. */
  reason?: string;
}

/**
 * Run one identity action. The response is the authoritative state afterwards,
 * so it is cached — that is the only way this SPA ever learns the provisioning
 * state — and every read that the action could have changed is invalidated.
 */
export function useIdentityActionMutation(): UseMutationResult<
  ProvisioningStatusResponse,
  unknown,
  IdentityActionInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, action, reason }: IdentityActionInput) => {
      const { data } = await apiClient.post<ProvisioningStatusResponse>(
        `/api/hr/admin/employees/${employeeId}/${action}`,
        action === 'lock' && reason ? { reason } : undefined,
      );
      return data;
    },
    onSuccess: (status, { employeeId }) => {
      // The action's own answer is the freshest state there is — seed it so the
      // panel updates immediately — then refetch everything it may have changed.
      queryClient.setQueryData(identityKeys.status(employeeId), status);
      void queryClient.invalidateQueries({ queryKey: identityKeys.employee(employeeId) });
    },
  });
}

/**
 * Offboarding. Distinct from the other actions because its result is a
 * checklist, not a state: `identityDisabled` plus the services the BR-05
 * fan-out reached (`notified`) and missed (`failed`). A non-empty `failed` is a
 * PARTIAL success — `OffboardingService` commits TERMINATED either way — and the
 * UI must render that as partial rather than as either outcome.
 */
export function useOffboardMutation(): UseMutationResult<OffboardingResponse, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { data } = await apiClient.post<OffboardingResponse>(
        `/api/hr/admin/employees/${employeeId}/offboard`,
      );
      return data;
    },
    onSuccess: (_result, employeeId) => {
      // Offboarding does NOT answer with a `ProvisioningStatusResponse`, so the
      // cached state is now stale in the worst way — it would show "Provisioned"
      // beside a Terminated record. Invalidating refetches the real state from
      // the server, which is exactly what the operator needs to see next.
      void queryClient.invalidateQueries({ queryKey: identityKeys.employee(employeeId) });
    },
  });
}
