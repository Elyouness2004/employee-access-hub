import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { applyServerErrors, type SubmissionFailure } from '@/shared/api';
import { Alert, FormField } from '@/shared/components';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Select,
  Textarea,
} from '@/shared/components/ui';
import { LEAVE_TEXT_MAX } from '../api/leave-api';
import { useSubmitLeaveMutation } from '../api/leave-api';
import { leaveRequestSchema, LEAVE_FORM_FIELDS, type LeaveRequestFormValues } from '../schemas';

/**
 * Submit a leave request (P05).
 *
 * The interesting part is what happens when the server says no. BR-01 and BR-03
 * come back as 422 with a sentence the domain wrote — "requested 5 business
 * day(s) but only 3 available", "period 2026-03-14..2026-03-18 overlaps approved
 * leave 2026-03-16..2026-03-20". Those are actionable; replacing them with
 * "Invalid request" would throw away the only thing the user needs. So the
 * form-level alert renders the server's own words, and the input is never wiped.
 *
 * The dialog stays open on failure for the same reason: the answer belongs where
 * the user is looking, next to the fields they would change.
 */
export interface LeaveRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Days the balance says are available, for the helper text (ANNUAL only). */
  availableDays?: number;
}

export function LeaveRequestDialog({ open, onOpenChange, availableDays }: LeaveRequestDialogProps) {
  const submit = useSubmitLeaveMutation();
  const [failure, setFailure] = useState<SubmissionFailure | null>(null);

  const form = useForm<LeaveRequestFormValues>({
    resolver: zodResolver(leaveRequestSchema),
    mode: 'onBlur',
    defaultValues: { type: 'ANNUAL', startDate: '', endDate: '', reason: '' },
  });

  const close = () => {
    setFailure(null);
    form.reset();
    onOpenChange(false);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await submit.mutateAsync({
        type: values.type,
        startDate: values.startDate,
        endDate: values.endDate,
        ...(values.reason.trim() ? { reason: values.reason.trim() } : {}),
      });
      close();
    } catch (error) {
      setFailure(applyServerErrors(error, form.setError, LEAVE_FORM_FIELDS));
    }
  });

  const type = form.watch('type');

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent size="md">
        <div className="flex flex-col gap-1">
          <DialogTitle>Request leave</DialogTitle>
          <DialogDescription>
            Your manager decides this request. Working days are counted by the server once you
            submit.
          </DialogDescription>
        </div>

        {failure?.formMessage ? (
          <Alert tone="danger" live="assertive" title="Your request was not submitted">
            <p>{failure.formMessage}</p>
            {failure.rule || failure.correlationId ? (
              <p className="mt-1 font-mono text-mono-sm">
                {failure.rule ? `Rule ${failure.rule}` : null}
                {failure.rule && failure.correlationId ? ' · ' : null}
                {failure.correlationId ? `Correlation id: ${failure.correlationId}` : null}
              </p>
            ) : null}
          </Alert>
        ) : null}

        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
          <FormField
            label="Leave type"
            required
            helper={
              type === 'ANNUAL' && availableDays !== undefined
                ? `Annual leave draws on your balance — ${availableDays} day${availableDays === 1 ? '' : 's'} available.`
                : 'Sick and unpaid leave do not draw on your annual balance.'
            }
            {...(form.formState.errors.type?.message
              ? { error: form.formState.errors.type.message }
              : {})}
          >
            {(props) => (
              <Select {...props} {...form.register('type')}>
                <option value="ANNUAL">Annual leave</option>
                <option value="SICK">Sick leave</option>
                <option value="UNPAID">Unpaid leave</option>
              </Select>
            )}
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="First day"
              required
              {...(form.formState.errors.startDate?.message
                ? { error: form.formState.errors.startDate.message }
                : {})}
            >
              {(props) => <Input type="date" {...props} {...form.register('startDate')} />}
            </FormField>
            <FormField
              label="Last day"
              required
              helper="Inclusive. A request cannot span two calendar years."
              {...(form.formState.errors.endDate?.message
                ? { error: form.formState.errors.endDate.message }
                : {})}
            >
              {(props) => <Input type="date" {...props} {...form.register('endDate')} />}
            </FormField>
          </div>

          <FormField
            label="Reason"
            helper={`Optional — up to ${LEAVE_TEXT_MAX} characters. Your manager sees this.`}
            {...(form.formState.errors.reason?.message
              ? { error: form.formState.errors.reason.message }
              : {})}
          >
            {(props) => <Textarea {...props} {...form.register('reason')} />}
          </FormField>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close} disabled={submit.isPending}>
              Cancel
            </Button>
            {/* Submit stays enabled while invalid: clicking then reveals what
                is wrong and focuses it, which a disabled button cannot do. */}
            <Button type="submit" loading={submit.isPending}>
              Submit request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
