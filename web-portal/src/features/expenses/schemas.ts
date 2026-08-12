import { z } from 'zod';

import { EXPENSE_TEXT_MAX } from './api/expenses-api';
import { todayIso } from '@/shared/lib/format';

/**
 * Client-side expense rules, each mirroring a Bean Validation constraint on
 * `CreateExpenseRequest` and citing it. They save a round trip; they never make
 * the decision.
 *
 * Deliberately NOT duplicated: the BR-03 approval threshold. It is readable only
 * by HR/ADMIN (`ExpenseThresholdController` is annotated `hasAnyRole('HR',
 * 'ADMIN')`), so an employee's client cannot know it — and a guessed threshold
 * that disagreed with the server would mislead people about whether their claim
 * needs a second approval. The form states the RULE instead of a number.
 */
export const expenseFormSchema = z.object({
  // `@NotNull ExpenseCategory`
  category: z.enum(['TRAVEL', 'MEALS', 'ACCOMMODATION', 'SUPPLIES', 'TRAINING', 'OTHER'], {
    errorMap: () => ({ message: 'Choose a category.' }),
  }),
  // `@NotNull @Positive @Digits(integer = 10, fraction = 2)`
  amount: z
    .string()
    .min(1, 'Enter the amount you spent.')
    .refine((value) => Number.isFinite(Number(value)), 'Enter a number, for example 42.50.')
    .refine((value) => Number(value) > 0, 'The amount must be greater than zero.')
    .refine(
      (value) => /^\d{1,10}(\.\d{1,2})?$/.test(value.trim()),
      'Use at most 2 decimal places.',
    ),
  // `@NotNull @PastOrPresent LocalDate`
  expenseDate: z
    .string()
    .min(1, 'Choose the date you spent it.')
    .refine((value) => value <= todayIso(), 'The date cannot be in the future.'),
  // `@Size(max = 500)`
  description: z
    .string()
    .max(EXPENSE_TEXT_MAX, `Keep the description under ${EXPENSE_TEXT_MAX} characters.`),
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

/** Field names the server can return in a 400 `errors` map for this form. */
export const EXPENSE_FORM_FIELDS = ['category', 'amount', 'expenseDate', 'description'] as const;

/**
 * The BR-03 threshold form (P21) — mirrors `ThresholdRequest`'s Bean Validation
 * and nothing more. Note `@PositiveOrZero`, not `@Positive`: zero is a legal
 * threshold, and it means every claim needs a second sign-off. The form says so
 * rather than rejecting a value the server accepts.
 */
export const thresholdSchema = z.object({
  // `@NotNull @PositiveOrZero @Digits(integer = 10, fraction = 2)`
  amount: z
    .string()
    .min(1, 'Enter the threshold amount.')
    .refine((value) => Number.isFinite(Number(value)), 'Enter a number, for example 5000.00.')
    .refine((value) => Number(value) >= 0, 'The threshold cannot be negative.')
    .refine(
      (value) => /^\d{1,10}(\.\d{1,2})?$/.test(value.trim()),
      'Use at most 2 decimal places.',
    ),
  // `@Size(min = 3, max = 3)`
  currency: z
    .string()
    .trim()
    .length(3, 'Use a 3-letter ISO-4217 code, for example MAD.')
    .regex(/^[A-Za-z]{3}$/, 'Use a 3-letter ISO-4217 code, for example MAD.'),
});

export type ThresholdFormValues = z.infer<typeof thresholdSchema>;

/** Field names the server can return in a 400 `errors` map for the threshold. */
export const THRESHOLD_FORM_FIELDS = ['amount', 'currency'] as const;
