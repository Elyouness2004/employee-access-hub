import { z } from 'zod';

import { todayIso } from '@/shared/lib/format';

import { EMPLOYEE_EMAIL_MAX, EMPLOYEE_MATRICULE_MAX, EMPLOYEE_NAME_MAX } from './api/employees-api';

/**
 * Employee form rules. Every one cites the Bean Validation annotation on
 * `EmployeeRequest` it mirrors, so drift is visible in review, and every one
 * exists only to save a round trip — the server decides.
 *
 * Deliberately NOT duplicated client-side:
 *  - matricule / email uniqueness (409) — this client does not hold the
 *    workforce, and a guess that disagrees with the server is worse than none;
 *  - department / position / manager existence (422) — same reason, and the
 *    catalogue in the browser may be a clamped page;
 *  - "an employee cannot be their own manager" is enforced here only as an
 *    affordance in the picker; the 422 remains the authority.
 */
export const employeeSchema = z.object({
  // `@NotBlank @Size(max = 32)`
  matricule: z
    .string()
    .trim()
    .min(1, 'Enter the payroll matricule.')
    .max(EMPLOYEE_MATRICULE_MAX, `Keep the matricule under ${EMPLOYEE_MATRICULE_MAX} characters.`),
  // `@NotBlank @Size(max = 100)`
  firstName: z
    .string()
    .trim()
    .min(1, 'Enter a first name.')
    .max(EMPLOYEE_NAME_MAX, `Keep it under ${EMPLOYEE_NAME_MAX} characters.`),
  lastName: z
    .string()
    .trim()
    .min(1, 'Enter a last name.')
    .max(EMPLOYEE_NAME_MAX, `Keep it under ${EMPLOYEE_NAME_MAX} characters.`),
  // `@NotBlank @Email @Size(max = 255)` — this also becomes the Keycloak username.
  email: z
    .string()
    .trim()
    .min(1, 'Enter a work email address.')
    .email('Enter a valid email address.')
    .max(EMPLOYEE_EMAIL_MAX, `Keep it under ${EMPLOYEE_EMAIL_MAX} characters.`),
  // `@NotNull @PastOrPresent LocalDate`
  hireDate: z
    .string()
    .min(1, 'Choose the hire date.')
    .refine((value) => value <= todayIso(), {
      message: 'The hire date cannot be in the future.',
    }),
  // `@NotNull EmployeeStatus`
  status: z.enum(['ACTIVE', 'DISABLED', 'TERMINATED'], {
    errorMap: () => ({ message: 'Choose a record status.' }),
  }),
  // `@NotNull UUID` — both catalogues are mandatory on the record. The wording
  // differs from the select's placeholder on purpose: an error that reads
  // exactly like the empty option tells the user nothing new.
  departmentId: z.string().min(1, 'Select the department this employee belongs to.'),
  positionId: z.string().min(1, 'Select the position this employee holds.'),
  // Optional: an employee may have no manager (the top of the chart).
  managerId: z.string().nullable(),
});

export type EmployeeFormValues = z.infer<typeof employeeSchema>;

/** Field names the server can return in a 400 `errors` map for this form. */
export const EMPLOYEE_FORM_FIELDS = [
  'matricule',
  'firstName',
  'lastName',
  'email',
  'hireDate',
  'status',
  'departmentId',
  'positionId',
  'managerId',
] as const;
