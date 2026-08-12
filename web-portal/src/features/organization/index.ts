/** Public surface of the organization feature (P18 departments, P19 positions). */
export { DepartmentsPage } from './pages/DepartmentsPage';
export { PositionsPage } from './pages/PositionsPage';
export {
  DEPARTMENTS,
  POSITIONS,
  organizationKeys,
  useCatalogueListQuery,
  useDeleteCatalogueEntryMutation,
  useSaveCatalogueEntryMutation,
  CATALOGUE_LABEL_MAX,
  CATALOGUE_DESCRIPTION_MAX,
  CATALOGUE_LIST_PAGE_SIZE,
} from './api/organization-api';
export type {
  CatalogueDescriptor,
  CatalogueEntryView,
  CatalogueKey,
  CatalogueListParams,
  CatalogueWrite,
} from './api/organization-api';
