import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { applyServerErrors, type SubmissionFailure } from '@/shared/api';
import {
  Alert,
  AlertSlot,
  ConfirmActionDialog,
  DetailList,
  FormField,
  QueryStateBoundary,
  type DetailItem,
} from '@/shared/components';
import { Button, Input, Skeleton, VisuallyHidden } from '@/shared/components/ui';
import { formatDateTime, formatMoney } from '@/shared/lib/format';

import { useThresholdQuery, useUpdateThresholdMutation } from '../api/expenses-api';
import { thresholdSchema, THRESHOLD_FORM_FIELDS, type ThresholdFormValues } from '../schemas';

/**
 * P21 — the BR-03 second-level approval threshold, with its provenance.
 *
 * `ThresholdResponse` carries `updatedBy` (a **username**, not a UUID) and
 * `updatedAt`, so this is one of the few places in the platform where "who
 * changed this, and when" is readable without the audit trail. It is shown
 * because a governance setting with no visible author is a setting nobody owns.
 *
 * Changing it is confirmed, and the confirmation names the two consequences
 * that are true of `ExpenseThresholdService.update` + `Expense.firstApproval`:
 *
 *  - it applies to **future first approvals only** — a claim already sitting in
 *    the second-approval queue was routed there at its own first approval and
 *    stays there;
 *  - changing the **currency** breaks the comparison for claims held in the old
 *    one: `Money.isGreaterThan` refuses to compare two currencies, so those
 *    approvals answer 422 until their currency matches again.
 */
export function ThresholdPanel() {
  const query = useThresholdQuery();
  const update = useUpdateThresholdMutation();
  const [failure, setFailure] = useState<SubmissionFailure | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /**
   * The raw error, kept so the DIALOG can report it. `ConfirmActionDialog` stays
   * open on failure by design — a refusal has to be reported where the user is
   * looking, not behind a dialog that vanished — and it renders the server's
   * sentence plus the mono correlation id from the error itself.
   */
  const [rejected, setRejected] = useState<unknown>(null);
  // Generated, not literal — see BalanceAdminPanel for the same reasoning.
  const currentHeadingId = useId();
  const changeHeadingId = useId();

  const form = useForm<ThresholdFormValues>({
    resolver: zodResolver(thresholdSchema),
    mode: 'onBlur',
    defaultValues: { amount: '', currency: '' },
  });

  const { reset } = form;
  const current = query.data;
  /*
   * Load the server's value into the form — but NEVER over an edit in progress.
   * Keyed on the values rather than the object, so a refetch returning the same
   * threshold is a no-op; and guarded by `isDirty`, so if another admin changes
   * the threshold while this one is typing, their input survives. The stale
   * figure they are editing against is still visible in the panel beside them,
   * and the server has the last word on the write either way.
   */
  const currentAmount = current?.amount;
  const currentCurrency = current?.currency;
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    if (currentAmount === undefined || currentCurrency === undefined || isDirty) return;
    reset({ amount: currentAmount.toFixed(2), currency: currentCurrency });
  }, [currentAmount, currentCurrency, isDirty, reset]);

  if (query.isPending) {
    return (
      <div aria-busy="true" className="rounded-lg border border-border bg-surface p-5">
        <VisuallyHidden>Loading the approval threshold</VisuallyHidden>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-4 h-5 w-64" />
      </div>
    );
  }

  if (query.error || !current) {
    return <QueryStateBoundary error={query.error} onRetry={() => void query.refetch()} />;
  }

  const provenance: DetailItem[] = [
    { label: 'Current threshold', value: formatMoney(current.amount, current.currency) },
    { label: 'Currency', value: current.currency, mono: true },
    // Provenance is rendered exactly as the server holds it; "—" is honest for
    // a value that has never been changed since the Flyway seed.
    { label: 'Last changed by', value: current.updatedBy ?? '—', mono: Boolean(current.updatedBy) },
    { label: 'Last changed', value: formatDateTime(current.updatedAt), mono: true },
  ];

  const values = form.getValues();
  const currencyChanging = values.currency.trim().toUpperCase() !== current.currency.toUpperCase();

  const submit = form.handleSubmit(() => {
    setFailure(null);
    setRejected(null);
    setSaved(null);
    setConfirming(true);
  });

  const confirm = async () => {
    const next = form.getValues();
    setFailure(null);
    setRejected(null);
    try {
      const updated = await update.mutateAsync({
        amount: Number(next.amount),
        currency: next.currency.trim().toUpperCase(),
      });
      setConfirming(false);
      setSaved(
        `Claims above ${formatMoney(updated.amount, updated.currency)} now need a second approval.`,
      );
      reset({ amount: updated.amount.toFixed(2), currency: updated.currency });
    } catch (error) {
      // The dialog STAYS OPEN and reports it. The field mapping still runs, so
      // a 400 that names `amount` is already flagged on the field by the time
      // the user dismisses the dialog to go and fix it.
      setRejected(error);
      setFailure(applyServerErrors(error, form.setError, THRESHOLD_FORM_FIELDS));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby={currentHeadingId} className="flex flex-col gap-3">
        <h2 id={currentHeadingId} className="text-section-title text-ink-strong">
          Current setting
        </h2>
        <div className="rounded-lg border border-border bg-surface p-5">
          <DetailList items={provenance} />
          <p className="mt-4 text-body-secondary text-ink-muted">
            A claim strictly above this amount routes to a second-level HR or Admin sign-off when
            its first approver decides it (BR-03). At or below it, the first approval finalises the
            claim.
          </p>
        </div>
      </section>

      <section aria-labelledby={changeHeadingId} className="flex flex-col gap-3">
        <h2 id={changeHeadingId} className="text-section-title text-ink-strong">
          Change the threshold
        </h2>
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5"
        >
          <AlertSlot>
            {saved ? (
              <Alert tone="info" live={false} title="Threshold updated">
                {saved}
              </Alert>
            ) : null}
          </AlertSlot>

          <AlertSlot live="assertive">
            {failure?.formMessage ? (
              <Alert tone="danger" live={false} title="The threshold was not changed">
                <p>{failure.formMessage}</p>
                {failure.correlationId ? (
                  <p className="mt-1 font-mono text-mono-sm">
                    Correlation id: {failure.correlationId}
                  </p>
                ) : null}
              </Alert>
            ) : null}
          </AlertSlot>

          <FormField
            label="Threshold amount"
            required
            helper="Up to 2 decimal places. Zero is allowed and means every claim needs a second approval."
            {...(form.formState.errors.amount?.message
              ? { error: form.formState.errors.amount.message }
              : {})}
          >
            {(props) => <Input {...props} inputMode="decimal" {...form.register('amount')} />}
          </FormField>

          <FormField
            label="Currency"
            required
            helper="3-letter ISO-4217 code. This is the deployment currency — claims are never converted, so changing it stops the threshold applying to claims held in the old one."
            {...(form.formState.errors.currency?.message
              ? { error: form.formState.errors.currency.message }
              : {})}
          >
            {(props) => (
              <Input {...props} maxLength={3} autoComplete="off" {...form.register('currency')} />
            )}
          </FormField>

          <div className="flex justify-end">
            <Button type="submit" loading={update.isPending}>
              Review change
            </Button>
          </div>
        </form>
      </section>

      <ConfirmActionDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Change the approval threshold?"
        description={
          <>
            Claims above{' '}
            {formatMoney(
              Number(values.amount || 0),
              values.currency.trim().toUpperCase() || current.currency,
            )}{' '}
            will need a second-level approval, instead of{' '}
            {formatMoney(current.amount, current.currency)}.
          </>
        }
        consequences={[
          'It applies to first approvals made from now on — a claim already awaiting a second sign-off stays where it is.',
          'The change is written to the audit trail against your username.',
          ...(currencyChanging
            ? [
                `Claims held in ${current.currency} can no longer be compared against a ${values.currency.trim().toUpperCase()} threshold, so approving them is refused until the currencies match.`,
              ]
            : []),
        ]}
        confirmLabel="Change threshold"
        cancelLabel="Keep the current threshold"
        busy={update.isPending}
        error={rejected}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}
