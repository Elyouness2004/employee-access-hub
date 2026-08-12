import type { LeaveType } from '@/shared/types/leave';

/**
 * Human labels for the `LeaveType` enum, in one place so a list and a detail
 * page cannot show "Annual" and "ANNUAL" for the same record. The raw literal
 * stays available where it is genuinely machine data (§3.2).
 */
export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ANNUAL: 'Annual',
  SICK: 'Sick',
  UNPAID: 'Unpaid',
};
