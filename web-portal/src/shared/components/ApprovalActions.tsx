import { useState, type ReactNode } from 'react';

import { isApiError, messageFor } from '@/shared/api';
import { Alert } from '@/shared/components/Alert';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Textarea,
} from '@/shared/components/ui';
import { FormField } from '@/shared/components/FormField';

/**
 * Approve / reject with an optional comment — shared by the leave and expense
 * queues (DESIGN-SYSTEM §11.3), which is why it lives in `shared` rather than in
 * either feature.
 *
 * Three behaviours it exists to guarantee:
 *
 *  - **Never optimistic.** The row does not change until the server answers. A
 *    decision is not idempotent and somebody else may be deciding the same item.
 *  - **A 409 is a lost race, not an error.** The message says the item was
 *    already decided and the caller refreshes the queue — the user is told what
 *    happened rather than shown a red failure for a legitimate outcome.
 *  - **`PENDING_SECOND_APPROVAL` is reported honestly.** When approving pushes
 *    an expense above the threshold the outcome is "sent for second-level
 *    approval", never "approved" — the caller supplies that wording from the
 *    status the server returns.
 */
export interface ApprovalActionsProps {
  /** What is being decided, named in the confirmation ("Amina's 3-day request"). */
  subject: ReactNode;
  /**
   * Short identifying phrase for the row, appended to each button's accessible
   * name. A queue of rows with N buttons all called "Approve" gives a screen
   * reader nothing to choose between (WCAG 2.4.4).
   */
  rowLabel?: string;
  /** Max comment length the endpoint accepts (`@Size(max = 500)`). */
  commentMaxLength: number;
  busy?: boolean;
  onDecide: (decision: 'approve' | 'reject', comment: string | undefined) => Promise<void>;
  /** Called after any failure so the caller can refresh a possibly-stale row. */
  onConflict?: () => void;
  /** Fired when a decision dialog opens — lets the caller clear a stale outcome. */
  onDialogOpen?: () => void;
  size?: 'default' | 'compact';
  /**
   * Why the server would refuse THIS decision from THIS user — the dual-approver
   * rule (BR-03) and the no-self-decision rule (BR-02) are the two that apply.
   *
   * An affordance, not the rule: the server still decides, and these strings
   * exist so a control that would 422 is disabled **with its reason stated**
   * rather than inviting a click that can only fail (DESIGN-SYSTEM §12 forbids
   * a disabled control without a reason). The reason is rendered as text, so it
   * is not carried by the disabled state alone.
   */
  approveRefusedReason?: string;
  rejectRefusedReason?: string;
}

export function ApprovalActions({
  subject,
  rowLabel,
  commentMaxLength,
  busy = false,
  onDecide,
  onConflict,
  onDialogOpen,
  size = 'compact',
  approveRefusedReason,
  rejectRefusedReason,
}: ApprovalActionsProps) {
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [raced, setRaced] = useState(false);

  const close = () => {
    setDecision(null);
    setComment('');
    setFailure(null);
    setRaced(false);
  };

  const submit = async () => {
    if (!decision) return;
    setFailure(null);
    try {
      await onDecide(decision, comment.trim() || undefined);
      close();
    } catch (error) {
      const conflict = isApiError(error) && error.kind === 'conflict';
      setRaced(conflict);
      setFailure(
        conflict
          ? `${messageFor(error)} The queue has been refreshed — someone else got there first.`
          : messageFor(error),
      );
      if (conflict) onConflict?.();
    }
  };

  const tooLong = comment.length > commentMaxLength;
  // One rule can refuse both controls (BR-02 refuses either decision on your
  // own record); stating it twice would be noise, not clarity.
  const refusals = [...new Set([rejectRefusedReason, approveRefusedReason].filter(Boolean))];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size={size}
          variant="secondary"
          disabled={Boolean(rejectRefusedReason)}
          aria-label={rowLabel ? `Reject ${rowLabel}` : undefined}
          onClick={() => {
            onDialogOpen?.();
            setDecision('reject');
          }}
        >
          Reject
        </Button>
        <Button
          size={size}
          disabled={Boolean(approveRefusedReason)}
          aria-label={rowLabel ? `Approve ${rowLabel}` : undefined}
          onClick={() => {
            onDialogOpen?.();
            setDecision('approve');
          }}
        >
          Approve
        </Button>
        {/* The reason a disabled control is disabled, as text — never only as
            the greyed-out state, which conveys nothing to anyone. */}
        {refusals.map((reason) => (
          <p key={reason} className="basis-full text-left text-caption text-ink-muted">
            {reason}
          </p>
        ))}
      </div>

      <Dialog open={decision !== null} onOpenChange={(next) => (next ? undefined : close())}>
        <DialogContent size="md">
          <div className="flex flex-col gap-1">
            <DialogTitle>
              {decision === 'approve' ? 'Approve this request?' : 'Reject this request?'}
            </DialogTitle>
            <DialogDescription>{subject}</DialogDescription>
          </div>

          {failure ? (
            <Alert
              tone={raced ? 'warning' : 'danger'}
              live="assertive"
              title={raced ? 'Already decided' : 'The decision was not recorded'}
            >
              {failure}
            </Alert>
          ) : null}

          <FormField
            label="Comment"
            helper={`Optional — up to ${commentMaxLength} characters. The requester sees this.`}
            {...(tooLong
              ? { error: `Keep the comment under ${commentMaxLength} characters.` }
              : {})}
          >
            {(props) => (
              <Textarea
                {...props}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            )}
          </FormField>

          <DialogFooter>
            <Button variant="secondary" onClick={close} disabled={busy}>
              {raced ? 'Close' : 'Cancel'}
            </Button>
            {!raced ? (
              <Button
                variant={decision === 'reject' ? 'destructive' : 'primary'}
                loading={busy}
                disabled={tooLong}
                onClick={() => void submit()}
              >
                {decision === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
