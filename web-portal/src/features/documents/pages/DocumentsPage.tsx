import { DocumentBrowser } from '../components/DocumentBrowser';

/**
 * P10 — Documents (`/documents`). Every authenticated role.
 *
 * The list is scoped by the server: `DocumentSpecifications.accessibleBy`
 * applies the FR-41 rule in SQL, so this page shows what the caller may reach
 * and the page count is truthful. An empty library is a legitimate state for an
 * employee, not a failure — and it is worded that way.
 */
export function DocumentsPage() {
  return (
    <DocumentBrowser
      title="Documents"
      description="Company-wide documents and anything filed to your account. Every download is recorded in the audit trail."
    />
  );
}
