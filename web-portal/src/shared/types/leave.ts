/**
 * leave-service DTOs — transcribed from the Java records (see ./README.md).
 *
 * Source: services/leave-service/src/main/java/com/hub/leave/api/dto/*.java
 *         services/leave-service/src/main/java/com/hub/leave/domain/*.java
 */

/**
 * `com.hub.leave.domain.LeaveStatus` — the whole state machine (Diagram 19).
 * SUBMITTED is the only state a decision or a cancellation may leave from.
 * There is deliberately no DRAFT: a request exists only once submitted.
 */
export type LeaveStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** `com.hub.leave.domain.LeaveType` — only ANNUAL draws on the tracked balance (BR-01). */
export type LeaveType = 'ANNUAL' | 'SICK' | 'UNPAID';

/** Types whose approval debits the balance — mirrors `LeaveType.isBalanceTracked()`. */
export const BALANCE_TRACKED_LEAVE_TYPES: readonly LeaveType[] = ['ANNUAL'];

/** `LeaveRequestResponse`. */
export interface LeaveRequestResponse {
  id: string;
  /** HR record id of the requester. */
  employeeId: string;
  /** Login account of the requester — compare against `sub` for ownership. */
  employeeKeycloakId: string;
  /** The manager SNAPSHOTTED at submission; null when the request was escalated. */
  managerKeycloakId: string | null;
  /** True when nobody could decide it locally, so HR owns it (BR-02). */
  hrEscalated: boolean;
  type: LeaveType;
  /** ISO dates bounding the leave PERIOD (not the submission time). */
  startDate: string;
  endDate: string;
  /** Server-computed working days — never recomputed client-side. */
  businessDays: number;
  reason: string | null;
  status: LeaveStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `SubmitLeaveRequest` — body of `POST /api/leave/requests`. */
export interface SubmitLeaveRequest {
  type: LeaveType;
  startDate: string;
  endDate: string;
  /** `@Size(max = 500)`, optional. */
  reason?: string;
}

/** `DecisionRequest` — optional comment on approve/reject (`@Size(max = 500)`). */
export interface DecisionRequest {
  comment?: string;
}

/**
 * `BalanceAdjustmentRequest` — body of `PUT /api/leave/balances/{employeeId}`
 * (HR/ADMIN, FR-22).
 *
 * The server refuses an allocation below `usedDays` with a 422 — that floor is
 * `LeaveBalance.adjustTotal`'s rule, not the client's.
 */
export interface BalanceAdjustmentRequest {
  /** `@NotNull @Min(0)`. */
  totalDays: number;
  /** `@Size(max = 500)`, optional — lands in the audit trail. */
  reason?: string;
}

/**
 * `LeaveBalanceResponse` — `GET /api/leave/balances/my`. The endpoint provisions
 * the default allocation on first use, so a 404 here means the caller has no
 * employee record linked, not "no balance row".
 */
export interface LeaveBalanceResponse {
  id: string;
  employeeId: string;
  employeeKeycloakId: string;
  year: number;
  totalDays: number;
  usedDays: number;
  availableDays: number;
}
