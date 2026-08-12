import { DocumentBrowser } from '../components/DocumentBrowser';

/**
 * P22 — Document admin (`/hr/documents`). HR + ADMIN.
 *
 * The same endpoint and the same scope as the library, plus the write surface
 * the controller reserves for `hasAnyRole('HR','ADMIN')`: multipart upload,
 * metadata edit, and delete-with-bytes.
 *
 * Category *management* is deliberately not here — it is ADMIN-only and lives
 * at `/admin/document-categories` (P25). HR can file documents under a category
 * without being able to create or re-tier one, which is exactly the split the
 * two controllers encode.
 */
export function DocumentAdminPage() {
  return (
    <DocumentBrowser
      manage
      title="Document admin"
      description="Upload, re-file and remove documents. The category a document is filed under is what decides who can read it."
    />
  );
}
