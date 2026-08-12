import { FileUp, Paperclip, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';

import { IconButton, VisuallyHidden } from '@/shared/components/ui';
import { cn } from '@/shared/lib/cn';

import {
  acceptAttribute,
  describeAllowedTypes,
  formatBytes,
  uploadPolicy,
} from '../api/documents-api';

/**
 * File selection for the multipart upload (DESIGN-SYSTEM §11.2).
 *
 * Three things this deliberately does:
 *
 *  - **States the limits before a file is chosen.** They come from mirrored
 *    configuration (documents-service publishes its policy on no endpoint), so
 *    the panel says where they come from instead of presenting them as facts
 *    the server confirmed.
 *  - **Pre-checks size and MIME as a courtesy, and says so.** A 12 MB file
 *    refused here costs nothing; refused after the upload it costs the upload.
 *    The server's 413/415 is still the only verdict — this check can be wrong
 *    (a deployment may have retuned the policy) and the copy never claims
 *    otherwise.
 *  - **Never invents progress.** The percentage comes from the XHR's
 *    bytes-sent events. When the total length is unknown the bar goes
 *    indeterminate rather than animating toward a number nobody measured.
 *
 * Drag-and-drop is an addition, never the only route: a **visible** native
 * `<input type="file">` carries the whole interaction for keyboard and touch
 * (no drag-only interactions — accessibility rules).
 *
 * The input is deliberately not hidden behind a styled button. That pattern
 * puts the real control off-screen, which leaves it focusable with no visible
 * focus ring (WCAG 2.4.7) and adds a second tab stop for one action. The native
 * control already gives a keyboard-openable picker, the platform's file dialog
 * on every device, and a correct accessible name from its label; it is styled
 * through Tailwind's `file:` variants so it still reads as one of this design
 * system's controls.
 */

export interface FileUploaderProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** 0–100 while uploading, `undefined` for indeterminate, `null` when idle. */
  progress?: number | null | undefined;
  isUploading?: boolean;
  /** A client-side rejection or the server's 413/415 sentence. */
  error?: string | null;
  disabled?: boolean;
}

export function FileUploader({
  file,
  onFileChange,
  progress,
  isUploading = false,
  error,
  disabled = false,
}: FileUploaderProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const select = (next: File | null) => {
    onFileChange(next);
    // Let the same file be re-chosen after a rejection; without this the input
    // holds the old value and `change` never fires again.
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) select(dropped);
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-label text-ink-strong">
        File
      </label>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !isUploading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border border-dashed p-5 text-center',
          isDragging ? 'border-border-strong bg-surface-hover' : 'border-border bg-surface-2',
        )}
      >
        <FileUp aria-hidden="true" className="size-6 text-ink-muted" />
        <p className="text-body text-ink">
          Drop a file here, or choose one — dropping is optional.
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={acceptAttribute()}
          disabled={disabled || isUploading}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={error ? true : undefined}
          onChange={(event) => select(event.target.files?.[0] ?? null)}
          // The focus ring is the global `:focus-visible` rule (globals.css) —
          // never restyled per component (DESIGN-SYSTEM §8). Only the picker
          // button inside the control is restyled here, to the secondary
          // button's tokens, so it is not an un-themed platform default.
          className={cn(
            'max-w-full text-body-secondary text-ink',
            'file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-action-secondary-border',
            'file:bg-surface file:px-3 file:text-label file:text-ink-strong hover:file:bg-surface-hover',
            'disabled:text-ink-disabled disabled:file:bg-surface-2 disabled:file:text-ink-disabled',
          )}
        />
      </div>

      {/* One text node, not an interpolated fragment: the limit and the
          allowlist are a single sentence for a screen reader, and a value
          split across elements is a value that can be read apart from it. */}
      <p id={hintId} className="text-helper text-ink-muted">
        {`Up to ${formatBytes(uploadPolicy.maxFileSizeBytes)}. Accepted: ${describeAllowedTypes()}. These limits mirror this deployment's configuration — the server has the final say.`}
      </p>

      {file ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
          <Paperclip aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate font-mono text-mono-sm text-ink-strong">
            {file.name}
          </span>
          <span className="shrink-0 tabular-nums text-caption text-ink-muted">
            {formatBytes(file.size)}
          </span>
          {isUploading ? null : (
            <IconButton
              size="compact"
              label={`Remove ${file.name}`}
              onClick={() => select(null)}
              disabled={disabled}
            >
              <X aria-hidden="true" />
            </IconButton>
          )}
        </div>
      ) : null}

      {isUploading ? (
        <div className="flex flex-col gap-1">
          {/*
            Real bytes-sent progress from the XHR. The percentage is exposed
            through `role="progressbar"` + `aria-valuenow`, which assistive tech
            reports on demand — NOT through a live region. A polite region
            re-reading "43% sent" on every progress event would re-announce the
            whole line dozens of times per upload and make the dialog unusable,
            the same trap the session countdown avoids. The single polite
            announcement below fires once, when the upload starts.
          */}
          <div
            role="progressbar"
            aria-label="Upload progress"
            {...(typeof progress === 'number'
              ? { 'aria-valuenow': progress, 'aria-valuemin': 0, 'aria-valuemax': 100 }
              : {})}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className={cn(
                'h-full bg-action-primary',
                typeof progress === 'number' ? 'transition-[width]' : 'w-1/3',
              )}
              style={typeof progress === 'number' ? { width: `${progress}%` } : undefined}
            />
          </div>
          <p className="text-caption text-ink-muted">
            {typeof progress === 'number'
              ? `Uploading — ${progress}% sent`
              : 'Uploading — the total size is not known, so no percentage can be shown.'}
          </p>
          <VisuallyHidden role="status">Uploading {file?.name ?? 'the file'}.</VisuallyHidden>
        </div>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-validation text-status-danger-text">
          {error}
        </p>
      ) : (
        <VisuallyHidden id={errorId} />
      )}
    </div>
  );
}
