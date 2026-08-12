import type { DocumentAccessRole } from '@/shared/types/documents';

/**
 * The `AccessRole` ladder, in the order the enum ranks it, with what each rung
 * actually means for reach. The wording carries the rule so a picker never
 * reduces the decision to four bare role names.
 */
export const MIN_ROLE_OPTIONS: readonly { value: DocumentAccessRole; label: string }[] = [
  { value: 'EMPLOYEE', label: 'Employee — everyone in the company' },
  { value: 'MANAGER', label: 'Manager — managers, HR and admins' },
  { value: 'HR', label: 'HR — HR and admins only (sensitive)' },
  { value: 'ADMIN', label: 'Admin — admins only (sensitive)' },
];

/** Short label for a category row. */
export function minRoleLabel(role: DocumentAccessRole): string {
  return MIN_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}
