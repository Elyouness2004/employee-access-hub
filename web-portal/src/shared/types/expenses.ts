/**
 * expense-service DTOs — transcribed from the Java records (see ./README.md).
 *
 * Source: services/expense-service/src/main/java/com/hub/expense/api/dto/*.java
 *         services/expense-service/src/main/java/com/hub/expense/domain/*.java
 */

/**
 * `com.hub.expense.domain.ExpenseStatus`.
 *
 * PENDING_SECOND_APPROVAL is a first-class state, NOT a flavour of APPROVED: an
 * above-threshold claim that a manager approved is awaiting HR/Admin sign-off
 * (BR-03) and may still be rejected. Rendering it as approved would tell
 * somebody they are getting money they might not get.
 */
export type ExpenseStatus =
  'SUBMITTED' | 'PENDING_SECOND_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** `com.hub.expense.domain.ExpenseCategory` — flat; the DB check constraint mirrors it. */
export type ExpenseCategory =
  'TRAVEL' | 'MEALS' | 'ACCOMMODATION' | 'SUPPLIES' | 'TRAINING' | 'OTHER';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'TRAVEL',
  'MEALS',
  'ACCOMMODATION',
  'SUPPLIES',
  'TRAINING',
  'OTHER',
];

/** `ExpenseResponse`. */
export interface ExpenseResponse {
  id: string;
  employeeId: string;
  /** Login account of the claimant — compare against `sub` for ownership. */
  employeeKeycloakId: string;
  /** The manager SNAPSHOTTED at creation; null when escalated. */
  managerKeycloakId: string | null;
  hrEscalated: boolean;
  category: ExpenseCategory;
  /** Serialized by Jackson as a JSON number (BigDecimal). */
  amount: number;
  /** ISO 4217 code; the service defaults it to the deployment currency. */
  currency: string;
  /** ISO date of the expense itself (not the submission). */
  expenseDate: string;
  description: string | null;
  status: ExpenseStatus;
  /** Set when the first approval routed the claim above the threshold (BR-03). */
  secondApprovalRequired: boolean;
  firstApproverKeycloakId: string | null;
  firstApprovedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `CreateExpenseRequest` — body of `POST /api/expenses`.
 * `currency` is optional: the service applies the deployment currency when it is
 * omitted (single-currency deployment), so the UI must not invent one.
 */
export interface CreateExpenseRequest {
  category: ExpenseCategory;
  /** `@Positive @Digits(integer = 10, fraction = 2)`. */
  amount: number;
  /** `@Size(min = 3, max = 3)` when present. */
  currency?: string;
  /** `@PastOrPresent`. */
  expenseDate: string;
  /** `@Size(max = 500)`. */
  description?: string;
}

/** `DecisionRequest` — optional comment on approve/reject (`@Size(max = 500)`). */
export interface ExpenseDecisionRequest {
  comment?: string;
}

/**
 * `ThresholdResponse` — `GET /api/expenses/threshold`. **HR/ADMIN only**: an
 * employee or a manager receives 403, which is expected and must not be shown
 * as an error.
 *
 * `updatedBy` is a **username** (`Actor.username()`), not a UUID — the one place
 * in the platform where a decision's author is readable as a name.
 */
export interface ThresholdResponse {
  amount: number;
  currency: string;
  updatedBy: string | null;
  updatedAt: string | null;
}

/**
 * `ThresholdRequest` — body of `PUT /api/expenses/threshold` (HR/ADMIN, BR-03).
 *
 * `currency` is optional; omitted, the service keeps the currency already
 * stored. Changing it is consequential: `Money.isGreaterThan` refuses to compare
 * two currencies, so claims held in the previous currency can no longer be
 * threshold-checked and their approval answers 422.
 */
export interface ThresholdRequest {
  /** `@NotNull @PositiveOrZero @Digits(integer = 10, fraction = 2)`. */
  amount: number;
  /** `@Size(min = 3, max = 3)` when present. */
  currency?: string;
}
