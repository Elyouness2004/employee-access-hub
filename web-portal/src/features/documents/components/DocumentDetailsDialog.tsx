import { DetailList, StatusBadge, TechnicalDetails } from '@/shared/components';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/components/ui';
import { formatDateTime } from '@/shared/lib/format';
import { PersonReference, usePeopleLookup } from '@/shared/people';
import type { DocumentResponse } from '@/shared/types/documents';

import { formatBytes } from '../api/documents-api';
import { contentTypeLabel } from '../content-types';
import { DocumentAccessPanel } from './DocumentAccessPanel';
import { FileDownloadAction } from './FileDownloadAction';

/**
 * Everything the record actually holds about one document, plus the download.
 *
 * What is NOT here is the point: `DocumentResponse` carries no storage key and
 * no stored filename, and neither is fabricated. A metadata-only record shows
 * "—" for size and type because that is what was recorded — a dash is the
 * honest rendering of a null, and "0 B" would be a measurement nobody took.
 *
 * `uploadedBy` is a `preferred_username` and `ownerKeycloakId` a subject —
 * documents-service holds no names. Both are resolved through the shared people
 * lookup rather than a private one, so this dialog and the browser behind it
 * cannot disagree about who a document belongs to; where the resolver has no
 * answer the stored value is shown rather than a guess.
 */
export interface DocumentDetailsDialogProps {
  document: DocumentResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentDetailsDialog({
  document,
  open,
  onOpenChange,
}: DocumentDetailsDialogProps) {
  const people = usePeopleLookup({
    keycloakIds: [document?.ownerKeycloakId],
    usernames: [document?.uploadedBy],
  });

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <div className="flex flex-col gap-1">
          <DialogTitle>{document.title}</DialogTitle>
          <DialogDescription>
            {document.description ?? 'No description was recorded for this document.'}
          </DialogDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {document.sensitive ? <StatusBadge status="SENSITIVE_DOCUMENT" /> : null}
          <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-caption text-ink-muted">
            {document.categoryName}
          </span>
        </div>

        <DetailList
          items={[
            {
              label: 'Size',
              value: formatBytes(document.sizeBytes),
              mono: document.sizeBytes !== null,
            },
            { label: 'File type', value: contentTypeLabel(document.contentType) },
            {
              label: 'Uploaded by',
              value: (
                <PersonReference
                  resolution={people.byUsername(document.uploadedBy)}
                  fallback={document.uploadedBy}
                  fullFallback
                  showEmail
                />
              ),
            },
            {
              label: 'Belongs to',
              value:
                document.ownerKeycloakId === null ? (
                  'Company-wide — no single owner'
                ) : (
                  <PersonReference
                    resolution={people.byKeycloakId(document.ownerKeycloakId)}
                    fallback={document.ownerKeycloakId}
                    showEmail
                  />
                ),
            },
            { label: 'Added', value: formatDateTime(document.createdAt), mono: true },
            { label: 'Last updated', value: formatDateTime(document.updatedAt), mono: true },
          ]}
        />

        <DocumentAccessPanel document={document} />

        <TechnicalDetails>
          <DetailList
            items={[
              { label: 'Document id', value: document.id, mono: true },
              { label: 'Category id', value: document.categoryId, mono: true },
              {
                label: 'Owner (Keycloak subject)',
                value: document.ownerKeycloakId ?? 'None — company-wide document',
                mono: Boolean(document.ownerKeycloakId),
              },
              { label: 'Uploaded by (username)', value: document.uploadedBy, mono: true },
              {
                label: 'Content type',
                value: document.contentType ?? 'None — metadata-only record',
                mono: Boolean(document.contentType),
              },
            ]}
          />
        </TechnicalDetails>

        {/* Stated visibly, not sr-only: that a download is recorded is a fact
            about what the action does, and everyone deciding whether to take it
            needs it equally. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-caption text-ink-muted">
            Downloading is recorded in the audit trail, as every document download is.
          </p>
          <FileDownloadAction document={document} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
