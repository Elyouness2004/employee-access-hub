/**
 * Human names for the MIME types this deployment allowlists
 * (`hub.documents.storage.allowed-content-types`).
 *
 * Presentation only: the list of types that matter is the configured one, and a
 * type missing from this map falls back to the raw MIME string rather than
 * being hidden. Nothing here decides what is accepted.
 */
export const CONTENT_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/gif': 'GIF',
  'text/plain': 'text',
  'text/csv': 'CSV',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
};

/** Short label for a document's recorded content type; `null` stays honest. */
export function contentTypeLabel(contentType: string | null): string {
  if (!contentType) return '—';
  return CONTENT_TYPE_LABELS[contentType] ?? contentType;
}
