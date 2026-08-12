import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo, useRef, type MutableRefObject } from 'react';

import { apiClient } from '@/shared/api';
import type { PersonResponse } from '@/shared/types/hr';

/**
 * The ONE place the SPA turns a stored identifier into a person.
 *
 * Every record in the platform names people with opaque values — a leave
 * decision carries `decidedBy` (a Keycloak subject), an approvals queue carries
 * `employeeKeycloakId`, an audit event carries `employee:<uuid>` and a
 * `preferred_username`, a document carries `uploadedBy`. None of them is
 * readable, and each bounded context deliberately keeps names out of its own
 * model, so no amount of reading a leave response will ever produce one.
 *
 * `GET /api/hr/people` resolves those references, and this module is the only
 * caller. It lives in `shared/` for the same reason `shared/catalogues` does:
 * six features need the same lookup, a feature may not import another feature
 * (FRONTEND-ARCHITECTURE §14), and a per-feature copy would give one endpoint
 * several cache keys — so the approvals queue and the request detail could
 * disagree about who decided the same request.
 *
 * **It is a resolver, not a directory.** It answers only for identifiers the
 * caller already holds; enumerating people stays with `features/employees` and
 * its HR-only paged endpoint. Nothing here widens what a role may see: the
 * server decides, and an identifier it will not resolve simply comes back
 * unresolved.
 *
 * Verified against `PeopleController`:
 *   GET /api/hr/people?keycloakId=&employeeId=&username=
 *     authenticated (every role) · unpaged · ≤200 references · 400 beyond that
 *     unknown references are OMITTED from the answer, not an error
 */

/**
 * `Actor.system().username()` — the platform itself, recorded as the actor when
 * an action was automatic rather than performed by a person. It never resolves
 * to an employee, and that is correct.
 */
export const SYSTEM_ACTOR = 'system';

/** `PeopleDirectoryService.MAX_REFERENCES` — the server's per-request ceiling. */
export const PEOPLE_MAX_REFERENCES = 200;

/**
 * People change rarely and a page can ask for the same person from several
 * rows; the identity tier keeps the answer for five minutes
 * (FRONTEND-ARCHITECTURE §6, reference-data tier).
 */
const PEOPLE_STALE_TIME = 5 * 60_000;

/** What a caller holds. Any mix; empty entries are ignored. */
export interface PeopleReferences {
  keycloakIds?: readonly (string | null | undefined)[];
  employeeIds?: readonly (string | null | undefined)[];
  /** `preferred_username` values — audit actors, `uploadedBy`. */
  usernames?: readonly (string | null | undefined)[];
}

/**
 * A resolved batch, keyed every way a caller might hold the reference.
 *
 * `truncated` is not hidden: the ceiling is the server's, and a surface that
 * silently dropped the 201st reference would render some rows as people and
 * others as UUIDs with no stated reason.
 */
export interface PeopleDirectory {
  byKeycloakId: Map<string, PersonResponse>;
  byEmployeeId: Map<string, PersonResponse>;
  /** Keyed by BOTH username conventions, lower-cased: `a.b` and `a.b@corp`. */
  byUsername: Map<string, PersonResponse>;
  /** More references were asked for than one request may carry. */
  truncated: boolean;
}

const EMPTY_DIRECTORY: PeopleDirectory = {
  byKeycloakId: new Map(),
  byEmployeeId: new Map(),
  byUsername: new Map(),
  truncated: false,
};

function clean(values: readonly (string | null | undefined)[] | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') seen.add(value.trim());
  }
  // Sorted so the query key is stable however the rows were ordered — the same
  // page re-rendered in a different order must not refetch.
  return [...seen].sort();
}

interface NormalizedReferences {
  keycloakIds: string[];
  employeeIds: string[];
  usernames: string[];
  total: number;
}

function normalize(references: PeopleReferences): NormalizedReferences {
  const keycloakIds = clean(references.keycloakIds);
  const employeeIds = clean(references.employeeIds);
  const usernames = clean(references.usernames);
  return {
    keycloakIds,
    employeeIds,
    usernames,
    total: keycloakIds.length + employeeIds.length + usernames.length,
  };
}

export const peopleKeys = {
  all: ['people'] as const,
  resolve: (references: NormalizedReferences) =>
    [
      ...peopleKeys.all,
      references.keycloakIds,
      references.employeeIds,
      references.usernames,
    ] as const,
};

/** Local part of a work e-mail — the short login form of the same account. */
function loginOf(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  return at < 0 ? email : email.slice(0, at);
}

function toDirectory(people: PersonResponse[], truncated: boolean): PeopleDirectory {
  const byKeycloakId = new Map<string, PersonResponse>();
  const byEmployeeId = new Map<string, PersonResponse>();
  const byUsername = new Map<string, PersonResponse>();

  for (const person of people) {
    if (person.keycloakId) byKeycloakId.set(person.keycloakId, person);
    byEmployeeId.set(person.employeeId, person);
    // Both conventions map to the same person: hr-service provisions accounts
    // with the e-mail as the username, accounts created outside it carry the
    // short login. A caller holding an audit actor does not know which it has.
    for (const key of [person.username, person.email, loginOf(person.email)]) {
      if (key) byUsername.set(key.toLowerCase(), person);
    }
  }

  return { byKeycloakId, byEmployeeId, byUsername, truncated };
}

/**
 * Resolve a batch of references. Safe to call with nothing to resolve — it does
 * not fire a request, which is what lets a page hand it a column of ids that may
 * all be null without branching.
 */
export function usePeopleQuery(references: PeopleReferences): UseQueryResult<PeopleDirectory> {
  // No memo: `clean` sorts and de-duplicates, so the same page of rows produces
  // the same lists however they were ordered, and TanStack Query hashes the key
  // structurally — a fresh array each render is not a fresh query.
  const normalized = normalize(references);

  return useQuery({
    queryKey: peopleKeys.resolve(normalized),
    queryFn: async ({ signal }) => {
      // Clamped rather than sent: the server answers 400 above the ceiling, and
      // a page of rows losing every name because one batch was too large is a
      // worse outcome than resolving the first 200 and saying so.
      const truncated = normalized.total > PEOPLE_MAX_REFERENCES;
      let budget = PEOPLE_MAX_REFERENCES;
      const take = (values: string[]) => {
        const slice = values.slice(0, Math.max(budget, 0));
        budget -= slice.length;
        return slice;
      };
      const params = new URLSearchParams();
      for (const id of take(normalized.keycloakIds)) params.append('keycloakId', id);
      for (const id of take(normalized.employeeIds)) params.append('employeeId', id);
      for (const name of take(normalized.usernames)) params.append('username', name);

      const { data } = await apiClient.get<PersonResponse[]>('/api/hr/people', { signal, params });
      return toDirectory(data, truncated);
    },
    enabled: normalized.total > 0,
    staleTime: PEOPLE_STALE_TIME,
    // No retry override: the client's policy already retries transient failures
    // only and never a 4xx (api-integration). A 403 here means the caller may
    // not resolve, and asking twice would not change that.
  });
}

/**
 * How a single reference resolved — the four readings kept apart, because
 * collapsing them is how a failed lookup gets shown as a fact about the person.
 *
 *  - `resolved`     the directory names them.
 *  - `loading`      the lookup is in flight. Not "unknown".
 *  - `unavailable`  the lookup FAILED. Nothing is known either way.
 *  - `unknown`      the lookup succeeded and this reference is not in it — a
 *                   deleted record, a service account, `system`.
 *  - `absent`       there is no reference at all (a decision nobody made).
 */
export type PersonResolutionState = 'resolved' | 'loading' | 'unavailable' | 'unknown' | 'absent';

export interface PersonResolution {
  state: PersonResolutionState;
  person?: PersonResponse;
}

export interface PersonLookup {
  byKeycloakId: (id: string | null | undefined) => PersonResolution;
  byEmployeeId: (id: string | null | undefined) => PersonResolution;
  byUsername: (username: string | null | undefined) => PersonResolution;
  /** The whole batch failed — for the one "names unavailable" notice per surface. */
  isUnavailable: boolean;
  isLoading: boolean;
  /** The batch exceeded the server ceiling and was clamped. */
  truncated: boolean;
  refetch: () => void;
}

/**
 * The lookup a component uses. One query per surface, one resolution per
 * reference — components never fetch, they read.
 */
export function usePeopleLookup(references: PeopleReferences): PersonLookup {
  const query = usePeopleQuery(references);
  const directory = query.data ?? EMPTY_DIRECTORY;
  const isLoading = query.isPending && query.fetchStatus !== 'idle';
  const isUnavailable = Boolean(query.error);
  const { refetch } = query;

  // Stable while the answer is: table columns are memoized on this object, and
  // a fresh identity every render would rebuild every column on every keystroke
  // in the filter bar.
  return useMemo(() => {
    const resolve = (
      map: Map<string, PersonResponse>,
      key: string | null | undefined,
    ): PersonResolution => {
      if (!key) return { state: 'absent' };
      const person = map.get(key);
      if (person) return { state: 'resolved', person };
      if (isLoading) return { state: 'loading' };
      if (isUnavailable) return { state: 'unavailable' };
      // A clamped batch never asked about this reference, so "not a person on
      // record" would be a claim nobody checked. Unknown is only ever said
      // about a reference the server actually answered for.
      if (directory.truncated) return { state: 'unavailable' };
      return { state: 'unknown' };
    };

    return {
      byKeycloakId: (id) => resolve(directory.byKeycloakId, id),
      byEmployeeId: (id) => resolve(directory.byEmployeeId, id),
      byUsername: (username) => resolve(directory.byUsername, username?.toLowerCase()),
      isUnavailable,
      isLoading,
      truncated: directory.truncated,
      refetch: () => void refetch(),
    };
  }, [directory, isLoading, isUnavailable, refetch]);
}

/**
 * The lookup behind a ref, for TABLE COLUMN DEFINITIONS.
 *
 * A column list is memoized, and anything it closes over becomes a dependency:
 * putting the lookup itself in there rebuilds every column the moment the names
 * arrive. That is not just wasted work — the table re-renders under the user's
 * cursor, and a click already in flight (pointerdown on the old node, click on
 * the new one) is dropped. A row action that silently does nothing once in a
 * while is exactly the kind of defect nobody can reproduce.
 *
 * So the ref is the dependency — stable for the component's whole life — and the
 * cells read `people.current` as they render. They still update the instant the
 * names land, because the query settling re-renders the table anyway; they just
 * do it without rebuilding the columns underneath it.
 *
 * Use `usePeopleLookup` directly anywhere that is not a memoized column list.
 */
export function usePeopleLookupRef(references: PeopleReferences): MutableRefObject<PersonLookup> {
  const lookup = usePeopleLookup(references);
  const ref = useRef(lookup);
  // Assigned during render on purpose: an effect would leave the first paint
  // after the names arrive showing the previous, nameless answer.
  ref.current = lookup;
  return ref;
}
