/**
 * Public surface of the documents feature (P10 library, P22 admin, P25
 * categories). Everything else — the uploader, the form dialogs, the access
 * panel — is feature-private and stays that way until a second feature needs it.
 */
export { DocumentsPage } from './pages/DocumentsPage';
export { DocumentAdminPage } from './pages/DocumentAdminPage';
export { DocumentCategoriesPage } from './pages/DocumentCategoriesPage';
export { documentKeys, formatBytes, uploadPolicy } from './api/documents-api';
