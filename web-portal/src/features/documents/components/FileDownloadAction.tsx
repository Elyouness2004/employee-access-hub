import { Download, FileWarning } from 'lucide-react';
import { useState } from 'react';

import { isApiError } from '@/shared/api';
import { messageFor } from '@/shared/api/form-errors';
import { Button, IconButton, Spinner } from '@/shared/components/ui';
import type { DocumentResponse } from '@/shared/types/documents';

import { downloadDocumentContent } from '../api/documents-api';

/**
 * Fetching a document's bytes (DESIGN-SYSTEM §11.2), with the one distinction
 * this endpoint forces:
 *
 * **`404` on `/content` is not a failure.** It means the record holds metadata
 * for a blob this service never received — a legitimate state that
 * api-conventions §3 calls out by name. Reporting it as an error would send
 * someone hunting a bug in a record that is behaving exactly as designed, so it
 * renders as "metadata only" in the document's own words.
 *
 * The other outcomes stay distinct too: `403` shows the server's FR-41 sentence
 * (the category gate and ownership read differently), and `503 Document storage
 * unavailable` means the blob store is down and the answer is to wait — not to
 * retry harder, and not the same as a document with no bytes.
 *
 * The filename is whatever `Content-Disposition` said. It is never derived from
 * the title, the id or the storage key: the server named the file when it
 * stored it, and that name is the one the user recognises.
 */

export type DownloadOutcome =
  | { kind: 'idle' }
  | { kind: 'downloading' }
  | { kind: 'metadataOnly' }
  | { kind: 'failed'; message: string; correlationId?: string };

export interface FileDownloadActionProps {
  document: DocumentResponse;
  /** Icon-only for table rows; labelled button in the detail panel. */
  variant?: 'icon' | 'button';
  onOutcomeChange?: (outcome: DownloadOutcome) => void;
}

export function FileDownloadAction({
  document,
  variant = 'button',
  onOutcomeChange,
}: FileDownloadActionProps) {
  const [outcome, setOutcome] = useState<DownloadOutcome>({ kind: 'idle' });

  const report = (next: DownloadOutcome) => {
    setOutcome(next);
    onOutcomeChange?.(next);
  };

  const start = async () => {
    report({ kind: 'downloading' });
    try {
      await downloadDocumentContent(document);
      report({ kind: 'idle' });
    } catch (error) {
      if (isApiError(error) && error.kind === 'notFound') {
        report({ kind: 'metadataOnly' });
        return;
      }
      report({
        kind: 'failed',
        message: messageFor(error),
        ...(isApiError(error) && error.kind !== 'network' && error.correlationId
          ? { correlationId: error.correlationId }
          : {}),
      });
    }
  };

  const busy = outcome.kind === 'downloading';
  const label = `Download ${document.title}`;

  return (
    <div className="flex flex-col gap-1">
      {variant === 'icon' ? (
        <IconButton size="compact" label={label} disabled={busy} onClick={() => void start()}>
          {busy ? <Spinner /> : <Download aria-hidden="true" />}
        </IconButton>
      ) : (
        <Button variant="secondary" size="compact" loading={busy} onClick={() => void start()}>
          <Download aria-hidden="true" />
          Download
        </Button>
      )}

      {/* The outcome is announced because the user did not watch it happen —
          a saved file leaves no trace on the page otherwise.

          The icon variant says it shorter: that one sits in a right-aligned
          table cell, where a three-line sentence pushes the row out of shape.
          The full explanation lives in the details dialog, which is where
          someone who hit this goes next. */}
      <div aria-live="polite" className="empty:hidden">
        {outcome.kind === 'metadataOnly' ? (
          <p className="flex items-start gap-1.5 text-caption text-ink-muted">
            <FileWarning aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {variant === 'icon'
                ? 'Metadata only — no file stored.'
                : 'Metadata only — this record points at a file stored outside the platform, so there are no bytes here to download.'}
            </span>
          </p>
        ) : null}
        {outcome.kind === 'failed' ? (
          <p className="text-caption text-status-danger-text">
            {outcome.message}
            {outcome.correlationId ? (
              <span className="ml-1 font-mono text-mono-sm">({outcome.correlationId})</span>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
