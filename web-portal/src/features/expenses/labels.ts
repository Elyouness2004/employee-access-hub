import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/shared/types/expenses';

/**
 * Human labels for the `ExpenseCategory` enum, in one place so a form, a list, a
 * detail page and the three administration queues cannot show "Travel" and
 * "TRAVEL" for the same claim. The raw literal stays available where it is
 * genuinely machine data (DESIGN-SYSTEM §3.2).
 *
 * Sibling of `features/leave/labels.ts`; promoted out of `ExpenseFormDialog`
 * once P21 gave it six consumers instead of one.
 */
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  TRAVEL: 'Travel',
  MEALS: 'Meals',
  ACCOMMODATION: 'Accommodation',
  SUPPLIES: 'Supplies',
  TRAINING: 'Training',
  OTHER: 'Other',
};

/** The category enum as `FilterSelect`/`Select` options, in backend order. */
export const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

/** `ExpenseStatus` as filter options — the whole enum, exactly as the server names it. */
export const STATUS_OPTIONS = [
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'PENDING_SECOND_APPROVAL', label: 'Pending second approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;
