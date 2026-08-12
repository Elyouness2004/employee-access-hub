/**
 * Identity resolution — the single, shared way the SPA turns a stored
 * identifier (Keycloak subject, employee id, `preferred_username`) into the
 * person it names. See `people-api.ts` for why it lives in `shared/`.
 */
export {
  peopleKeys,
  usePeopleLookup,
  usePeopleLookupRef,
  usePeopleQuery,
  PEOPLE_MAX_REFERENCES,
  SYSTEM_ACTOR,
} from './people-api';
export type {
  PeopleDirectory,
  PeopleReferences,
  PersonLookup,
  PersonResolution,
  PersonResolutionState,
} from './people-api';
export { PersonReference } from './PersonReference';
export type { PersonReferenceProps } from './PersonReference';
export { PersonCell } from './PersonCell';
export type { PersonCellProps } from './PersonCell';
