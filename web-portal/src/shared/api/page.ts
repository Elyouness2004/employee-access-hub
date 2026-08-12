/**
 * The paged envelope every collection endpoint answers with, and the query
 * shape every one accepts (api-conventions §1). Sizes are clamped server-side
 * (200 on most endpoints; 100 on notifications and team); non-whitelisted sort
 * columns are silently dropped, so the UI must offer only whitelisted sorts —
 * each feature transcribes its whitelist as a typed constant in its api/.
 */

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface PageQuery {
  /** Zero-based page index. */
  page?: number;
  /** Rows per page — the server clamps to the endpoint's ceiling. */
  size?: number;
  /** `property,asc|desc` — repeatable; only whitelisted properties are honored. */
  sort?: string | string[];
  /** Free-text, case-insensitive, over the endpoint's text columns. */
  search?: string;
}

/** Serialize a PageQuery into Axios `params` (repeats `sort` when array). */
export function toPageParams(query: PageQuery): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (query.page !== undefined) params.page = query.page;
  if (query.size !== undefined) params.size = query.size;
  if (query.sort !== undefined) params.sort = query.sort;
  if (query.search) params.search = query.search;
  return params;
}
