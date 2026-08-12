import { z } from 'zod';

/**
 * Typed access to VITE_* configuration — the ONLY place that reads
 * import.meta.env (FRONTEND-ARCHITECTURE §12, enforced by ESLint).
 *
 * Everything here ships to the browser and is public by definition; secrets
 * never appear in VITE_* variables. Validation fails fast with a readable
 * error so a misconfigured environment cannot half-boot the app.
 */

/**
 * Numeric VITE_* variable: absent or empty falls back to the default, anything
 * else must parse as a whole number. `.env` files routinely carry empty values
 * (`VITE_X=`), which must mean "unset", not zero.
 */
function seconds(defaultValue: number, min: number) {
  return z.preprocess(
    (value) => (value === undefined || value === '' ? defaultValue : value),
    z.coerce.number().int().min(min),
  );
}

/** Byte-count VITE_* variable, same absent-or-empty-means-default rule. */
function bytes(defaultValue: number) {
  return z.preprocess(
    (value) => (value === undefined || value === '' ? defaultValue : value),
    z.coerce.number().int().positive(),
  );
}

/**
 * The MIME allowlist as `DocumentUploadPolicy` defaults it, kept in the same
 * order so the two lists can be diffed by eye.
 */
const DEFAULT_ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

/** `a, b ,c` → `['a','b','c']`, lower-cased and de-blanked, as the service normalises them. */
function commaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const envSchema = z.object({
  /** Gateway origin — the single API entry point (dev: http://localhost:8080). */
  VITE_API_BASE_URL: z.string().url({ message: 'must be the gateway origin URL' }),
  /** Keycloak realm issuer (dev: http://localhost:8081/realms/employee-hub). */
  VITE_OIDC_AUTHORITY: z.string().url({ message: 'must be the realm issuer URL' }),
  /** Public SPA client id registered in the realm (web-portal). */
  VITE_OIDC_CLIENT_ID: z.string().min(1, 'must be the SPA client id'),
  /**
   * OIDC redirect URIs. Optional overrides — by default they derive from the
   * page origin (/auth/callback, /login, /auth/silent), which the realm's
   * wildcard redirect URIs (:5173/*, :3000/*) already authorize.
   */
  VITE_OIDC_REDIRECT_URI: z.string().url({ message: 'must be an absolute URL' }).optional(),
  VITE_OIDC_POST_LOGOUT_REDIRECT_URI: z
    .string()
    .url({ message: 'must be an absolute URL' })
    .optional(),
  /**
   * Session-timeout policy MIRRORED from the realm (`ssoSessionIdleTimeout`,
   * `ssoSessionMaxLifespan` in keycloak-config/realm-employee-hub.json).
   * Keycloak exposes neither to the client, so the SPA has to be told — and a
   * deployment that changes the realm must change these together.
   *
   * These drive a client-side *usability* timer only. Keycloak remains the
   * authority on session validity: the timer never proves a session is alive,
   * it only warns the user and stops an idle page from working.
   */
  VITE_SESSION_IDLE_TIMEOUT_SECONDS: seconds(1800, 120),
  VITE_SESSION_MAX_LIFETIME_SECONDS: seconds(28800, 300),
  /** Lead time of the expiry warning — WCAG 2.2.1 requires at least 20 s; the product floor is 60. */
  VITE_SESSION_WARNING_SECONDS: seconds(60, 60),
  /**
   * Document upload policy MIRRORED from documents-service
   * (`hub.documents.storage.max-file-size` / `.allowed-content-types`).
   *
   * The service exposes its policy on no endpoint, so the SPA has to be told —
   * the same situation as the session limits above. These drive the limits
   * shown *before* a file is chosen and the courtesy pre-check that saves a
   * doomed 10 MB upload; the server's 413/415 remains the only verdict that
   * counts, and a deployment that retunes the service must retune these too.
   */
  VITE_DOCUMENT_MAX_FILE_SIZE_BYTES: bytes(10 * 1024 * 1024),
  VITE_DOCUMENT_ALLOWED_CONTENT_TYPES: z.preprocess(
    (value) => (value === undefined || value === '' ? DEFAULT_ALLOWED_CONTENT_TYPES : value),
    z.string().transform(commaSeparated),
  ),
  /** Dev-only: identity source — 'mock' (fixtures, default) or 'oidc' (real Keycloak). */
  VITE_DEV_AUTH: z.enum(['mock', 'oidc']).optional(),
  /** Dev-only: initial mocked identity role while VITE_DEV_AUTH=mock. */
  VITE_DEV_ROLE: z.enum(['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN']).optional(),
});

export type RawEnv = z.input<typeof envSchema>;

/** Exported for tests; the app uses the eagerly parsed `env` below. */
export function parseEnv(raw: Record<string, string | undefined>) {
  const result = envSchema
    .refine(
      (value) => value.VITE_SESSION_WARNING_SECONDS < value.VITE_SESSION_IDLE_TIMEOUT_SECONDS,
      {
        path: ['VITE_SESSION_WARNING_SECONDS'],
        message: 'must be shorter than VITE_SESSION_IDLE_TIMEOUT_SECONDS',
      },
    )
    .refine(
      (value) => value.VITE_SESSION_IDLE_TIMEOUT_SECONDS <= value.VITE_SESSION_MAX_LIFETIME_SECONDS,
      {
        path: ['VITE_SESSION_IDLE_TIMEOUT_SECONDS'],
        message: 'cannot exceed VITE_SESSION_MAX_LIFETIME_SECONDS',
      },
    )
    .safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `[web-portal] Invalid environment configuration:\n${issues}\n` +
        'Copy web-portal/.env.example to .env.development (or set the variables) and restart. ' +
        'All VITE_* values are public browser configuration — never put secrets in them.',
    );
  }
  const parsed = result.data;
  return {
    apiBaseUrl: parsed.VITE_API_BASE_URL,
    oidcAuthority: parsed.VITE_OIDC_AUTHORITY,
    oidcClientId: parsed.VITE_OIDC_CLIENT_ID,
    oidcRedirectUriOverride: parsed.VITE_OIDC_REDIRECT_URI,
    oidcPostLogoutRedirectUriOverride: parsed.VITE_OIDC_POST_LOGOUT_REDIRECT_URI,
    sessionIdleTimeoutSeconds: parsed.VITE_SESSION_IDLE_TIMEOUT_SECONDS,
    sessionMaxLifetimeSeconds: parsed.VITE_SESSION_MAX_LIFETIME_SECONDS,
    sessionWarningSeconds: parsed.VITE_SESSION_WARNING_SECONDS,
    documentMaxFileSizeBytes: parsed.VITE_DOCUMENT_MAX_FILE_SIZE_BYTES,
    documentAllowedContentTypes: parsed.VITE_DOCUMENT_ALLOWED_CONTENT_TYPES,
    devAuth: parsed.VITE_DEV_AUTH,
    devRole: parsed.VITE_DEV_ROLE,
  };
}

const parsed = parseEnv(import.meta.env);

export const env = {
  ...parsed,
  /**
   * Resolved OIDC redirect endpoints. The origin-derived defaults keep the SPA
   * config free of copies of its own address; the realm authorizes them via
   * its wildcard redirect URIs. Post-logout returns to /login so a signed-out
   * user lands on the controlled entry point, never a protected route.
   */
  oidcRedirectUri:
    parsed.oidcRedirectUriOverride ?? new URL('/auth/callback', window.location.origin).toString(),
  oidcPostLogoutRedirectUri:
    parsed.oidcPostLogoutRedirectUriOverride ??
    new URL('/login', window.location.origin).toString(),
  /** Iframe target for silent session restore — never user-visible. */
  oidcSilentRedirectUri: new URL('/auth/silent', window.location.origin).toString(),
  /** True in `vite dev` and vitest; statically false in production builds. */
  isDev: import.meta.env.DEV,
  mode: import.meta.env.MODE,
} as const;

export type Env = typeof env;

/**
 * True when the development fixture identity drives the shell instead of real
 * OIDC. `env.isDev` is statically false in production builds, so this is
 * `false` there no matter what — the mock path cannot exist in production.
 */
export const useMockIdentity = env.isDev && env.devAuth !== 'oidc';
