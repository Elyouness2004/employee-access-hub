/**
 * analytics-service DTOs, transcribed from the Java records (see
 * `src/shared/types/README.md`).
 *
 * Source files:
 *   services/analytics-service/src/main/java/com/hub/analytics/application/DashboardSummary.java
 *   .../EmployeeSummary.java · .../LeaveSummary.java · .../ExpenseSummary.java
 *   .../DocumentsSummary.java
 *
 * THE contract of this whole surface is `available`. Every section is assembled
 * from a downstream service through a circuit breaker; when that source cannot
 * be reached the record is built by its `unavailable()` factory, which fills
 * every count with **zero**. Those zeros are padding, not measurements — a UI
 * that renders them as numbers reports "0 employees" for an unreachable
 * hr-service. `available: false` must always render as the "Data unavailable"
 * pattern (DESIGN-SYSTEM §9.4), never as a figure.
 */

/** `EmployeeSummary` — HR headcount KPIs. */
export interface EmployeeSummary {
  available: boolean;
  totalEmployees: number;
  activeEmployees: number;
  disabledEmployees: number;
  departments: number;
  positions: number;
}

/** `LeaveSummary` — leave request KPIs by status. */
export interface LeaveSummary {
  available: boolean;
  submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
  total: number;
}

/**
 * `ExpenseSummary`. `approvedAmount` is a `BigDecimal` — it arrives as a JSON
 * number; `currency` is null when the source was unavailable.
 */
export interface ExpenseSummary {
  available: boolean;
  submitted: number;
  pendingSecondApproval: number;
  approved: number;
  rejected: number;
  cancelled: number;
  total: number;
  approvedAmount: number;
  currency: string | null;
}

/** `DocumentsSummary` — document and download KPIs. */
export interface DocumentsSummary {
  available: boolean;
  totalDocuments: number;
  sensitiveDocuments: number;
  totalCategories: number;
  downloadsLogged: number;
}

/**
 * `DashboardSummary` — one section per source plus the moment it was assembled.
 * `generatedAt` is the freshness stamp: the sections are snapshots, not live
 * reads, and the UI states when they were taken.
 */
export interface AnalyticsDashboardResponse {
  employees: EmployeeSummary;
  leave: LeaveSummary;
  expenses: ExpenseSummary;
  documents: DocumentsSummary;
  generatedAt: string;
}
