import type { User } from 'oidc-client-ts';

import { isRole, type Identity, type Role } from '@/shared/auth';

/**
 * Token-claims → shared Identity mapping.
 *
 * Realm fact (keycloak-config/realm-employee-hub.json): the `realm roles`
 * mapper writes `realm_access.roles` to the ACCESS token only
 * (`id.token.claim: false`), so roles must be read from the access-token
 * payload — the ID-token profile does not carry them. `preferred_username`
 * is mapped into both tokens.
 *
 * Decoding here is presentation only: the SPA never trusts these claims for
 * authorization (the gateway and services verify signatures on every call).
 */

interface AccessTokenClaims {
  sub?: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles?: string[] };
}

/** Decode a JWT payload without verification (display-only use). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.');
  if (segments.length !== 3 || !segments[1]) return null;
  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const payload: unknown = JSON.parse(
      // atob yields latin1; recover UTF-8 for accented display names.
      decodeURIComponent(
        Array.from(json, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
      ),
    );
    return typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Effective roles: the realm roles the SPA knows (EMPLOYEE/MANAGER/HR/ADMIN),
 * already composite-expanded by Keycloak at issuance. Realm-internal roles
 * (offline_access, uma_authorization, default-roles-*) are dropped — they
 * carry no UI meaning and must never leak into role-shaped rendering.
 */
export function effectiveRoles(claimRoles: readonly string[] | undefined): Role[] {
  return (claimRoles ?? []).filter(isRole);
}

/**
 * Build the shared Identity from an OIDC user. `subject` is the Keycloak
 * account id (`sub`) — NEVER an employeeId (ownership checks compare it
 * against `*KeycloakId` fields).
 */
export function identityFromUser(user: User): Identity | null {
  const access = (decodeJwtPayload(user.access_token) ?? {}) as AccessTokenClaims;
  const subject = access.sub ?? user.profile.sub;
  if (!subject) return null;

  const username = access.preferred_username ?? user.profile.preferred_username ?? subject;
  const fullName = [access.given_name, access.family_name].filter(Boolean).join(' ');
  const displayName = access.name ?? user.profile.name ?? fullName;

  return {
    subject,
    username,
    // A Keycloak user may carry no name claims at all — the username is the
    // honest fallback, never an empty user menu.
    displayName: displayName || username,
    roles: effectiveRoles(access.realm_access?.roles),
  };
}
