import { z } from 'zod';

import { BALANCE_REASON_MAX, LEAVE_TEXT_MAX } from './api/leave-api';

/**
 * Client-side leave rules. Each mirrors a server rule and cites it, so drift is
 * visible in review — and each exists only to save a round trip, never to make
 * a decision. The server is the authority: BR-01 (balance) and BR-03 (overlap)
 * are checked there and cannot be evaluated here at all, because this client
 * does not know the other approved requests.
 *
 * Deliberately NOT duplicated client-side:
 *  - balance sufficiency (BR-01) — the balance shown may be stale by the time
 *    the form is submitted, and a client-side "you don't have enough days" that
 *    the server disagrees with is worse than no check;
 *  - overlap with approved leave (BR-03) — the data is not on this client;
 *  - business-day counting — `businessDays` is server-computed and rendered, so
 *    a client estimate would eventually contradict the record.
 */
export const leaveRequestSchema = z
  .object({
    // `@NotNull LeaveType`
    type: z.enum(['ANNUAL', 'SICK', 'UNPAID'], {
      errorMap: () => ({ message: 'Choose a leave type.' }),
    }),
    // `@NotNull LocalDate`
    startDate: z.string().min(1, 'Choose the first day of leave.'),
    endDate: z.string().min(1, 'Choose the last day of leave.'),
    // `@Size(max = 500)`, optional
    reason: z.string().max(LEAVE_TEXT_MAX, `Keep the reason under ${LEAVE_TEXT_MAX} characters.`),
  })
  .refine((value) => value.endDate >= value.startDate, {
    // `DateRange.of` rejects an inverted range with a 422; catching it here
    // turns a server round trip into an immediate, field-level answer.
    path: ['endDate'],
    message: 'The last day cannot be before the first day.',
  })
  .refine((value) => value.startDate.slice(0, 4) === value.endDate.slice(0, 4), {
    // `LeaveRequest.submit`: "period spans two calendar years; submit one
    // request per year". Same rule, stated before the user submits.
    path: ['endDate'],
    message: 'A request cannot span two calendar years — submit one request per year.',
  });

export type LeaveRequestFormValues = z.infer<typeof leaveRequestSchema>;

/** Field names the server can return in a 400 `errors` map for this form. */
export const LEAVE_FORM_FIELDS = ['type', 'startDate', 'endDate', 'reason'] as const;

/**
 * HR balance adjustment (P20) — mirrors `BalanceAdjustmentRequest`'s Bean
 * Validation and nothing else.
 *
 * Deliberately NOT duplicated: the `totalDays >= usedDays` floor. It is
 * `LeaveBalance.adjustTotal`'s rule, evaluated against a `usedDays` that an
 * approval can move between this form's read and its write. The field states
 * the floor in helper text and the server's 422 sentence is what the user sees
 * if they cross it — a client-side copy would eventually disagree with the row
 * it is guarding.
 */
export const balanceAdjustmentSchema = z.object({
  // `@NotNull @Min(0) Integer`
  totalDays: z
    .string()
    .min(1, 'Enter the annual allocation in days.')
    .refine((value) => /^\d+$/.test(value.trim()), 'Enter a whole number of days, for example 25.'),
  // `@Size(max = 500)`
  reason: z
    .string()
    .max(BALANCE_REASON_MAX, `Keep the reason under ${BALANCE_REASON_MAX} characters.`),
});

export type BalanceAdjustmentFormValues = z.infer<typeof balanceAdjustmentSchema>;

/** Field names the server can return in a 400 `errors` map for the adjustment. */
export const BALANCE_FORM_FIELDS = ['totalDays', 'reason'] as const;
