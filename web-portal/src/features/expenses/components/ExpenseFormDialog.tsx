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
import { todayIso } from '@/shared/lib/format';
import { EXPENSE_CATEGORIES } from '@/shared/types/expenses';

import { EXPENSE_TEXT_MAX, useCreateExpenseMutation } from '../api/expenses-api';
import { CATEGORY_LABELS } from '../labels';
import { expenseFormSchema, EXPENSE_FORM_FIELDS, type ExpenseFormValues } from '../schemas';

/**
 * Submit an expense claim (P07).
 *
 * Currency is deliberately absent from the form. `CreateExpenseRequest.currency`
 * is optional and the service applies the deployment currency when it is
 * omitted — this is a single-currency deployment, and offering a picker would
 * imply a conversion the platform does not do. The claim comes back stamped with
 * whatever the server chose, and that is what the list shows.
 *
 * The threshold hint states the RULE, not a number: the threshold endpoint is
 * HR-only, so this client genuinely cannot read it, and inventing a figure would
 * mislead people about whether their claim needs a second sign-off.
 */
export interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExpenseFormDialog({ open, onOpenChange }: ExpenseFormDialogProps) {
  const create = useCreateExpenseMutation();
  const [failure, setFailure] = useState<SubmissionFailure | null>(null);

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    mode: 'onBlur',
    defaultValues: { category: 'TRAVEL', amount: '', expenseDate: '', description: '' },
  });

  const close = () => {
    setFailure(null);
    form.reset();
    onOpenChange(false);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await create.mutateAsync({
        category: values.category,
        amount: Number(values.amount),
        expenseDate: values.expenseDate,
        ...(values.description.trim() ? { description: values.description.trim() } : {}),
      });
      close();
    } catch (error) {
      setFailure(applyServerErrors(error, form.setError, EXPENSE_FORM_FIELDS));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent size="md">
        <div className="flex flex-col gap-1">
          <DialogTitle>Submit an expense claim</DialogTitle>
          <DialogDescription>
            Your manager reviews this claim. Claims above the company threshold need a second
            approval from HR before they are finalised.
          </DialogDescription>
        </div>

        {failure?.formMessage ? (
          <Alert tone="danger" live="assertive" title="Your claim was not submitted">
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
            label="Category"
            required
            {...(form.formState.errors.category?.message
              ? { error: form.formState.errors.category.message }
              : {})}
          >
            {(props) => (
              <Select {...props} {...form.register('category')}>
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category] ?? category}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Amount"
              required
              helper="Up to 2 decimal places, in the company currency."
              {...(form.formState.errors.amount?.message
                ? { error: form.formState.errors.amount.message }
                : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  mono
                  {...form.register('amount')}
                />
              )}
            </FormField>
            <FormField
              label="Date of expense"
              required
              helper="The day you spent it — not today's date unless they are the same."
              {...(form.formState.errors.expenseDate?.message
                ? { error: form.formState.errors.expenseDate.message }
                : {})}
            >
              {(props) => (
                <Input type="date" max={todayIso()} {...props} {...form.register('expenseDate')} />
              )}
            </FormField>
          </div>

          <FormField
            label="Description"
            helper={`Optional — up to ${EXPENSE_TEXT_MAX} characters. Give your approver enough to decide.`}
            {...(form.formState.errors.description?.message
              ? { error: form.formState.errors.description.message }
              : {})}
          >
            {(props) => <Textarea {...props} {...form.register('description')} />}
          </FormField>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Submit claim
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
