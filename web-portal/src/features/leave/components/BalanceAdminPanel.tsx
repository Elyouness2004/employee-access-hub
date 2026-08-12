import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarRange, UserRoundSearch } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { ReactNode } from 'react';

import { applyServerErrors, isApiError, type SubmissionFailure } from '@/shared/api';
import { Alert, AlertSlot, EmptyState, FormField, QueryStateBoundary } from '@/shared/components';
import { Button, Input, Select, Skeleton, Textarea, VisuallyHidden } from '@/shared/components/ui';
import type { LeaveBalanceResponse } from '@/shared/types/leave';

import {
  balanceYearOptions,
  BALANCE_REASON_MAX,
  useAdjustBalanceMutation,
  useEmployeeBalanceQuery,
} from '../api/leave-api';
import {
  balanceAdjustmentSchema,
  BALANCE_FORM_FIELDS,
  type BalanceAdjustmentFormValues,
} from '../schemas';
import { LeaveBalanceMeter } from './LeaveBalanceMeter';

/**
 * P20 — balance lookup and adjustment (FR-22).
 *
 * `GET/PUT /api/leave/balances/{employeeId}` take an **HR employee id**, never a
 * Keycloak subject: the path variable is matched against `LeaveBalance
 * .employeeId` and falls back to the HR directory by that same id. The picker
 * therefore hands this panel an `employeeId`, and the panel never touches
 * `subject`/`keycloakId`.
 *
 * The employee picker itself lives in `features/employees`, which this feature
 * may not import (FRONTEND-ARCHITECTURE §14). It arrives as a slot the composing
 * page fills — the same shape `AppHeader` uses for the notification bell.
 *
 * The adjustment floor (`totalDays >= usedDays`) belongs to the server: it is
 * stated in helper text before the user can cross it, and the server's own 422
 * sentence is what they see if they do. `usedDays` moves whenever an approval
 * lands, so a client-side copy of that comparison would eventually disagree with
 * the row it is guarding.
 */
export interface BalanceAdminPanelProps {
  /** HR employee id chosen by the composing page, or null when none is chosen. */
  employeeId: string | null;
  /**
   * Leave year, owned by the composing page so it lives in the URL alongside the
   * employee. Both are what is being looked at, and list/filter state belongs in
   * the query string (FRONTEND-ARCHITECTURE §4) — otherwise the view is not a
   * link, and the two halves get different lifetimes: the page keeps the
   * employee across a tab switch while this panel, inside `TabsContent`,
   * unmounts and silently reverts the year.
   */
  year: number;
  onYearChange: (year: number) => void;
  /** The employee picker, owned by `features/employees`. */
  picker: ReactNode;
  /** Label for the picker, wired to it by the composing page. */
  pickerLabelId?: string;
}

export function BalanceAdminPanel({
  employeeId,
  year,
  onYearChange,
  picker,
  pickerLabelId,
}: BalanceAdminPanelProps) {
  const yearSelectId = useId();

  const query = useEmployeeBalanceQuery(employeeId ?? '', year, {
    enabled: Boolean(employeeId),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span id={pickerLabelId} className="text-label text-ink-strong">
            Employee
          </span>
          {picker}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={yearSelectId} className="text-label text-ink-strong">
            Leave year
          </label>
          <Select
            id={yearSelectId}
            value={String(year)}
            onChange={(event) => onYearChange(Number(event.target.value))}
          >
            {balanceYearOptions().map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!employeeId ? (
        <EmptyState
          icon={UserRoundSearch}
          title="Choose an employee"
          description="Pick someone from the workforce to see their allocation for the selected year and adjust it."
        />
      ) : (
        <BalanceForEmployee employeeId={employeeId} year={year} query={query} />
      )}
    </div>
  );
}

function BalanceForEmployee({
  employeeId,
  year,
  query,
}: {
  employeeId: string;
  year: number;
  query: ReturnType<typeof useEmployeeBalanceQuery>;
}) {
  // Generated, not literal: two of these on one page would duplicate the id and
  // silently break both `aria-labelledby` associations.
  const balanceHeadingId = useId();
  const adjustHeadingId = useId();

  if (query.isPending) {
    return (
      <div aria-busy="true" className="rounded-lg border border-border bg-surface p-5">
        <VisuallyHidden>Loading the leave balance</VisuallyHidden>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-4 h-2 w-full" />
      </div>
    );
  }

  if (query.error) {
    // Two failures that mean different things and never get one render:
    // 404 = no such employee; 422 "Employee not eligible" = the employee exists
    // but has no identity link, so no allocation can be provisioned yet.
    const error = query.error;
    // Both are legitimate states rather than failures, so they render as empty
    // states — but they are still SERVER answers, and DESIGN-SYSTEM §9.4 wants
    // the correlation id on every surface that reports one.
    if (isApiError(error) && error.kind === 'notFound') {
      return (
        <EmptyState
          icon={UserRoundSearch}
          title="No such employee"
          description={
            <>
              The server found no employee with id{' '}
              <span className="font-mono text-mono-sm">{employeeId}</span>.
              {error.correlationId ? (
                <>
                  {' '}
                  <span className="font-mono text-mono-sm">
                    Correlation id: {error.correlationId}
                  </span>
                </>
              ) : null}
            </>
          }
        />
      );
    }
    if (isApiError(error) && error.kind === 'businessRule') {
      return (
        <EmptyState
          icon={CalendarRange}
          title="No allocation yet"
          description={
            <>
              {error.detail} A balance is provisioned once the identity link exists.
              {error.rule ? (
                <>
                  {' '}
                  <span className="font-mono text-mono-sm">Rule: {error.rule}</span>
                </>
              ) : null}
              {error.correlationId ? (
                <>
                  {' '}
                  <span className="font-mono text-mono-sm">
                    Correlation id: {error.correlationId}
                  </span>
                </>
              ) : null}
            </>
          }
        />
      );
    }
    return <QueryStateBoundary error={error} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby={balanceHeadingId} className="flex flex-col gap-3">
        <h2 id={balanceHeadingId} className="text-section-title text-ink-strong">
          Allocation for {year}
        </h2>
        <LeaveBalanceMeter balance={query.data} isLoading={false} error={null} />
      </section>

      <section aria-labelledby={adjustHeadingId} className="flex flex-col gap-3">
        <h2 id={adjustHeadingId} className="text-section-title text-ink-strong">
          Adjust the allocation
        </h2>
        {/*
          Keyed on the balance row, so choosing a different employee or year
          REMOUNTS the form with that row's figures. React's own way of saying
          "this is a different form now" — and it beats a reset effect, which
          would also fire on the re-render that follows a successful save and
          wipe the confirmation the user is reading.
        */}
        <AdjustmentForm
          key={query.data.id}
          employeeId={employeeId}
          year={year}
          balance={query.data}
        />
      </section>
    </div>
  );
}

function AdjustmentForm({
  employeeId,
  year,
  balance,
}: {
  employeeId: string;
  year: number;
  balance: LeaveBalanceResponse;
}) {
  const adjust = useAdjustBalanceMutation();
  const [failure, setFailure] = useState<SubmissionFailure | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const form = useForm<BalanceAdjustmentFormValues>({
    resolver: zodResolver(balanceAdjustmentSchema),
    mode: 'onBlur',
    defaultValues: { totalDays: String(balance.totalDays), reason: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    setSaved(null);
    try {
      const updated = await adjust.mutateAsync({
        employeeId,
        year,
        totalDays: Number(values.totalDays),
        ...(values.reason.trim() ? { reason: values.reason.trim() } : {}),
      });
      // Report the figures the SERVER returned — `availableDays` is its
      // arithmetic, not ours.
      setSaved(
        `Allocation for ${updated.year} set to ${updated.totalDays} days. ${updated.availableDays} now available after ${updated.usedDays} used.`,
      );
      form.reset({ totalDays: String(updated.totalDays), reason: '' });
    } catch (error) {
      setFailure(applyServerErrors(error, form.setError, BALANCE_FORM_FIELDS));
    }
  });

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5"
    >
      <AlertSlot>
        {saved ? (
          <Alert tone="info" live={false} title="Allocation updated">
            {saved}
          </Alert>
        ) : null}
      </AlertSlot>

      <AlertSlot live="assertive">
        {failure?.formMessage ? (
          <Alert tone="danger" live={false} title="The allocation was not changed">
            <p>{failure.formMessage}</p>
            {failure.rule ? (
              <p className="mt-1 font-mono text-mono-sm">Rule: {failure.rule}</p>
            ) : null}
            {failure.correlationId ? (
              <p className="mt-1 font-mono text-mono-sm">Correlation id: {failure.correlationId}</p>
            ) : null}
          </Alert>
        ) : null}
      </AlertSlot>

      <FormField
        label="Annual allocation (days)"
        required
        helper={`Whole days. It cannot go below the ${balance.usedDays} day(s) already used this year — the server refuses a lower figure.`}
        {...(form.formState.errors.totalDays?.message
          ? { error: form.formState.errors.totalDays.message }
          : {})}
      >
        {(props) => <Input {...props} inputMode="numeric" {...form.register('totalDays')} />}
      </FormField>

      <FormField
        label="Reason"
        helper={`Optional — up to ${BALANCE_REASON_MAX} characters. It is written to the audit trail with the before and after figures.`}
        {...(form.formState.errors.reason?.message
          ? { error: form.formState.errors.reason.message }
          : {})}
      >
        {(props) => <Textarea {...props} {...form.register('reason')} />}
      </FormField>

      <div className="flex justify-end">
        <Button type="submit" loading={adjust.isPending}>
          Save allocation
        </Button>
      </div>
    </form>
  );
}
