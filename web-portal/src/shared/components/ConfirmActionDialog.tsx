import { isValidElement, useState, type ReactNode } from 'react';

import { correlationIdOf, isApiError } from '@/shared/api';
import { messageFor } from '@/shared/api/form-errors';
import { Button } from '@/shared/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/shared/components/ui/Dialog';

/**
 * THE confirmation pattern (DESIGN-SYSTEM §9.4). One dialog, so a destructive
 * action never depends on which screen you happen to be on.
 *
 * Its contract is the copy, not the styling: a destructive confirmation NAMES
 * the object and ENUMERATES the consequences ("Cancel your leave request for
 * 14–18 Mar? The 3 days go back to your balance and your manager is notified").
 * A dialog that only asks "Are you sure?" has told the user nothing they did
 * not already know.
 *
 * `role="alertdialog"`, focus trapped and restored by the wrapped Radix
 * primitive. In-flight the confirm button shows busy and the dialog stays open,
 * so a failure can be reported where the user is looking.
 */
export interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What will happen, in the user's terms. Name the object. */
  description: ReactNode;
  /** Bullet list of consequences for anything destructive. */
  consequences?: ReactNode[];
  /**
   * Extra content under the consequences — a labelled reason field, a
   * type-to-confirm input. It sits OUTSIDE the description because Radix renders
   * that as a `<p>`, and a form control inside a paragraph is invalid markup
   * that screen readers read badly. Never a heading: the dialog already has one.
   */
  extra?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /**
   * Blocks confirmation until a precondition in `extra` is met (type-to-confirm).
   * The precondition must be stated in `extra` — a disabled control with no
   * stated reason is a design-system defect.
   */
  confirmDisabled?: boolean;
  /**
   * A failed attempt, rendered above the actions.
   *
   * Pass the raw error: the dialog renders the server's sentence AND the mono
   * correlation id, which every error surface must show (DESIGN-SYSTEM §9.4).
   * Doing it here rather than at each call site is what stops the next
   * confirmation from forgetting the id — two of them already had.
   * A `ReactNode` is still accepted for anything that is not an API failure.
   */
  error?: unknown;
  busy?: boolean;
  onConfirm: () => void;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  extra,
  confirmLabel,
  cancelLabel = 'Keep as is',
  destructive = false,
  confirmDisabled = false,
  error,
  busy = false,
  onConfirm,
}: ConfirmActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent size="sm" role="alertdialog">
        <div className="flex flex-col gap-2">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          {consequences?.length ? (
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-body-secondary text-ink-muted">
              {consequences.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : null}
          {extra ? <div className="mt-2">{extra}</div> : null}
          {error ? <ConfirmationError error={error} /> : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            loading={busy}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The failure of a confirmed action: the server's own sentence plus the id that
 * traces the request across all five services in Loki.
 */
function ConfirmationError({ error }: { error: unknown }) {
  // Anything already rendered (a plain string, an element) is shown as given.
  if (!isApiError(error)) {
    return (
      <div role="alert" className="text-body-secondary text-status-danger-text">
        {isValidElement(error) || typeof error === 'string'
          ? (error as ReactNode)
          : messageFor(error)}
      </div>
    );
  }
  const correlationId = correlationIdOf(error);
  return (
    <div role="alert" className="flex flex-col gap-1 text-body-secondary text-status-danger-text">
      <span>{messageFor(error)}</span>
      {correlationId ? (
        <span className="font-mono text-mono-sm text-ink-muted">
          Correlation id: {correlationId}
        </span>
      ) : null}
    </div>
  );
}

/** Local open/busy/error state for a confirmation — the same three every time. */
export function useConfirmation() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return {
    open,
    error,
    setError,
    ask: () => {
      setError(null);
      setOpen(true);
    },
    close: () => {
      setError(null);
      setOpen(false);
    },
    onOpenChange: (next: boolean) => {
      if (!next) setError(null);
      setOpen(next);
    },
  };
}
