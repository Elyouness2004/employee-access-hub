import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * List state lives in the URL (FRONTEND-ARCHITECTURE §4): page, size, sort,
 * search and every filter. That makes each filtered view a deep link, keeps the
 * back button correct, and survives a reload — none of which a component-state
 * implementation gives you.
 *
 * It also keeps the URL honest: only keys the caller declares are read, so a
 * hand-edited query string cannot smuggle a parameter into an API call.
 */

export interface UrlFilterState<K extends string> {
  /** Zero-based, as the API counts (api-conventions §1). */
  page: number;
  /** `property,asc|desc` — only ever a whitelisted column. */
  sort: string | undefined;
  search: string;
  filters: Record<K, string | undefined>;
  setPage: (page: number) => void;
  setSort: (sort: string | undefined) => void;
  setSearch: (search: string) => void;
  setFilter: (key: K, value: string | undefined) => void;
  clearFilters: () => void;
  /** True when anything narrows the list — drives "no matches" vs "none exist". */
  isFiltered: boolean;
}

export interface UrlFilterOptions<K extends string> {
  /** Filter keys this list understands; anything else in the URL is ignored. */
  keys: readonly K[];
  /** Sort applied when the URL names none. */
  defaultSort?: string;
  /**
   * Prefix for `page`, `sort` and `search` when TWO lists share one URL (the
   * approvals tabs). Without it they collide: a sort chosen on one endpoint
   * would be sent to the other, silently dropped as non-whitelisted, and the
   * URL would claim an ordering the results do not have.
   */
  namespace?: string;
}

export function useUrlFilters<K extends string>({
  keys,
  defaultSort,
  namespace = '',
}: UrlFilterOptions<K>): UrlFilterState<K> {
  const [params, setParams] = useSearchParams();
  const pageKey = `${namespace}page`;
  const sortKey = `${namespace}sort`;
  const searchKey = `${namespace}search`;

  const filters = useMemo(() => {
    const entries = keys.map((key) => [key, params.get(key) || undefined] as const);
    return Object.fromEntries(entries) as Record<K, string | undefined>;
  }, [keys, params]);

  const search = params.get(searchKey) ?? '';
  const sort = params.get(sortKey) ?? defaultSort;
  const pageParam = Number.parseInt(params.get(pageKey) ?? '0', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 0;

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void, { resetPage = true } = {}) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          mutate(next);
          // Any change to what is being listed invalidates the page number:
          // staying on page 4 of a newly-filtered list shows an empty table and
          // reads as "no results".
          if (resetPage) next.delete(pageKey);
          return next;
        },
        { replace: true },
      );
    },
    [pageKey, setParams],
  );

  const setValue = useCallback(
    (key: string, value: string | undefined) =>
      update((next) => {
        if (value) next.set(key, value);
        else next.delete(key);
      }),
    [update],
  );

  return {
    page,
    sort,
    search,
    filters,
    setPage: useCallback(
      (value: number) =>
        update(
          (next) => {
            if (value > 0) next.set(pageKey, String(value));
            else next.delete(pageKey);
          },
          { resetPage: false },
        ),
      [pageKey, update],
    ),
    setSort: useCallback(
      (value: string | undefined) => setValue(sortKey, value),
      [setValue, sortKey],
    ),
    setSearch: useCallback((value: string) => setValue(searchKey, value), [searchKey, setValue]),
    setFilter: useCallback((key: K, value: string | undefined) => setValue(key, value), [setValue]),
    clearFilters: useCallback(
      () =>
        update((next) => {
          for (const key of keys) next.delete(key);
          next.delete(searchKey);
        }),
      [keys, searchKey, update],
    ),
    isFiltered: Boolean(search) || keys.some((key) => Boolean(params.get(key))),
  };
}
