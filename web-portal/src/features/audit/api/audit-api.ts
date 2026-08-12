import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiClient, fetchBinary, saveBlob, toPageParams, type PageResponse } from '@/shared/api';
import type {
  AuditEntryResponse,
  AuditEventDetailResponse,
  AuditStatisticsResponse,
} from '@/shared/types/hr';

/**
 * The Audit Center (P23), verified against `AuditController`:
 *
 *   GET /api/hr/audit             HR+ADMIN · filters from,to,user,action,resource,result
 *                                 · search over actor/action/resource/details
 *                                 · sort occurredAt|actor|action|resource · size ≤200
 *   GET /api/hr/audit/{id}        one event + the timeline of its resource
 *   GET /api/hr/audit/statistics  bounded window, default the last 30 days
 *   GET /api/hr/audit/export      text/csv, itself recorded as AUDIT_EXPORTED
 *
 * **There is deliberately no mutation.** `audit_log` is append-only (BR-06) and
 * the controller exposes nothing that writes, so this feature has no mutation
 * hooks at all — not even a hidden one. Nothing in the UI may offer to edit or
 * delete an audit record.
 *
 * **What the trail does not capture** (verified in `AuditLogEntry`): correlation
 * id, role, IP address, browser, and session id are not columns, so they cannot
 * be shown and cannot be filtered on. A correlation-id search in particular is
 * impossible here — the id that ties a request together across services lives in
 * the logs (Loki), not in this table. The free-text `search` does reach
 * `details`, which is where an action wrote whatever context it chose.
 */

/** `AuditController.SORTABLE`, transcribed. Anything else the server drops. */
export const AUDIT_SORTABLE = ['occurredAt', 'actor', 'action', 'resource'] as const;
export type AuditSortKey = (typeof AUDIT_SORTABLE)[number];

/**
 * Column meta for a sortable audit column, typed to the whitelist.
 *
 * The server silently drops a sort on anything outside `AuditController.SORTABLE`,
 * so an unsortable-but-sortable-looking header would order nothing while
 * claiming to — on the one screen where an investigator most needs to trust the
 * ordering. Routing every affordance through here makes an invented column a
 * compile error.
 */
export function auditSort(key: AuditSortKey): { sortKey: string } {
  return { sortKey: key };
}
/** `@PageableDefault(sort = "occurredAt", direction = DESC)`. */
export const AUDIT_DEFAULT_SORT = 'occurredAt,desc';
export const AUDIT_PAGE_SIZE = 50;
/** `AuditQueryService.MAX_EXPORT_ROWS` — an export is capped, and the UI says so. */
export const AUDIT_MAX_EXPORT_ROWS = 10_000;

/**
 * The `result` values the server understands. `AuditFilter.parseResult` accepts
 * these two case-insensitively and treats anything else as "no filter" — so the
 * UI offers exactly these and no more.
 */
export const AUDIT_RESULTS = ['SUCCESS', 'FAILURE'] as const;

export interface AuditFilterParams {
  /** ISO date-time bounds on `occurredAt`; the API parses ISO 8601. */
  from: string | undefined;
  to: string | undefined;
  /** Actor login name; matched as a case-insensitive contains. */
  user: string | undefined;
  /** Machine action code; matched as an **exact** equality by the server. */
  action: string | undefined;
  /** Resource reference; matched as a case-insensitive contains. */
  resource: string | undefined;
  result: string | undefined;
  search: string;
}

export interface AuditListParams extends AuditFilterParams {
  page: number;
  sort: string | undefined;
}

export const auditKeys = {
  all: ['audit'] as const,
  lists: () => [...auditKeys.all, 'list'] as const,
  list: (params: AuditListParams) => [...auditKeys.lists(), params] as const,
  detail: (id: string) => [...auditKeys.all, 'detail', id] as const,
  statistics: (from: string | undefined, to: string | undefined) =>
    [...auditKeys.all, 'statistics', { from, to }] as const,
};

/** Only send a filter that is set — a blank value is not a filter. */
function filterParams(filter: AuditFilterParams): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.from) params.from = filter.from;
  if (filter.to) params.to = filter.to;
  if (filter.user) params.user = filter.user;
  if (filter.action) params.action = filter.action;
  if (filter.resource) params.resource = filter.resource;
  if (filter.result) params.result = filter.result;
  return params;
}

export function useAuditListQuery(
  params: AuditListParams,
): UseQueryResult<PageResponse<AuditEntryResponse>> {
  return useQuery({
    queryKey: auditKeys.list(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<AuditEntryResponse>>('/api/hr/audit', {
        signal,
        params: {
          ...toPageParams({
            page: params.page,
            size: AUDIT_PAGE_SIZE,
            sort: params.sort ?? AUDIT_DEFAULT_SORT,
            search: params.search,
          }),
          ...filterParams(params),
        },
      });
      return data;
    },
    // Audit is an investigation tool (FRONTEND-ARCHITECTURE §6): zero stale
    // time, because "what does the trail say right now" is the whole question.
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useAuditEventQuery(id: string | null): UseQueryResult<AuditEventDetailResponse> {
  return useQuery({
    queryKey: auditKeys.detail(id ?? 'none'),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<AuditEventDetailResponse>(`/api/hr/audit/${id}`, {
        signal,
      });
      return data;
    },
    enabled: id !== null,
    staleTime: 0,
  });
}

/**
 * The chart series. `from`/`to` are optional: the controller defaults to the
 * last 30 days, and passing nothing is how the UI asks for that default rather
 * than computing a window of its own that could drift from it.
 */
export function useAuditStatisticsQuery(
  from: string | undefined,
  to: string | undefined,
): UseQueryResult<AuditStatisticsResponse> {
  return useQuery({
    queryKey: auditKeys.statistics(from, to),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<AuditStatisticsResponse>('/api/hr/audit/statistics', {
        signal,
        params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
      });
      return data;
    },
    staleTime: 60_000,
  });
}

/**
 * Download the filtered events as CSV.
 *
 * The **server** writes the CSV — `AuditCsvWriter` quotes RFC-4180 style and
 * neutralises leading formula characters so a downloaded audit file cannot
 * become a spreadsheet formula-injection vector. Generating it client-side from
 * the page on screen would drop that protection and export 50 rows instead of
 * the filtered set.
 *
 * Collecting an export is itself a sensitive action: `AuditExportService`
 * records an `AUDIT_EXPORTED` row through the same append-only trail, in the
 * same transaction — so the export appears in the very trail it exported. The
 * UI states that before the user clicks.
 */
export async function exportAuditCsv(filter: AuditFilterParams): Promise<void> {
  const binary = await fetchBinary('/api/hr/audit/export', {
    fallbackFilename: 'audit-export.csv',
    params: { ...filterParams(filter), ...(filter.search ? { search: filter.search } : {}) },
  });
  saveBlob(binary);
}
