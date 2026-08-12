/**
 * The four composite realm roles (fact — keycloak-config/realm-employee-hub.json).
 * MANAGER, HR, and ADMIN each include EMPLOYEE; Keycloak expands composites at
 * token issuance, so a flat `roles.includes(...)` is correct client-side — no
 * hierarchy logic anywhere in the SPA.
 */

export const ROLES = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN'] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Flat membership check over the (pre-expanded) role list. */
export function hasAnyRole(roles: readonly Role[], required: readonly Role[]): boolean {
  return required.some((role) => roles.includes(role));
}
