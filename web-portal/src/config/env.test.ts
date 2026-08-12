import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

const valid = {
  VITE_API_BASE_URL: 'http://localhost:8080',
  VITE_OIDC_AUTHORITY: 'http://localhost:8081/realms/employee-hub',
  VITE_OIDC_CLIENT_ID: 'web-portal',
};

describe('parseEnv', () => {
  it('parses a valid environment into typed config', () => {
    expect(parseEnv({ ...valid, VITE_DEV_ROLE: 'HR' })).toEqual({
      apiBaseUrl: 'http://localhost:8080',
      oidcAuthority: 'http://localhost:8081/realms/employee-hub',
      oidcClientId: 'web-portal',
      oidcRedirectUriOverride: undefined,
      oidcPostLogoutRedirectUriOverride: undefined,
      // Defaults mirror the verified realm (30 min idle / 8 h max), so a
      // deployment that forgets them still gets the real policy.
      sessionIdleTimeoutSeconds: 1800,
      sessionMaxLifetimeSeconds: 28800,
      sessionWarningSeconds: 60,
      // Defaults mirror documents-service's own upload policy, so a deployment
      // that forgets them still advertises the limits the server enforces.
      documentMaxFileSizeBytes: 10 * 1024 * 1024,
      documentAllowedContentTypes: [
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
      ],
      devAuth: undefined,
      devRole: 'HR',
    });
  });

  describe('document upload policy', () => {
    it('reads the mirrored size ceiling and MIME allowlist from the environment', () => {
      const parsed = parseEnv({
        ...valid,
        VITE_DOCUMENT_MAX_FILE_SIZE_BYTES: '2097152',
        VITE_DOCUMENT_ALLOWED_CONTENT_TYPES: 'application/pdf, TEXT/CSV ,',
      });
      expect(parsed.documentMaxFileSizeBytes).toBe(2_097_152);
      // Normalised the way DocumentUploadPolicy normalises: trimmed,
      // lower-cased, blanks dropped.
      expect(parsed.documentAllowedContentTypes).toEqual(['application/pdf', 'text/csv']);
    });

    it('treats an empty value as unset rather than zero', () => {
      expect(
        parseEnv({ ...valid, VITE_DOCUMENT_MAX_FILE_SIZE_BYTES: '' }).documentMaxFileSizeBytes,
      ).toBe(10 * 1024 * 1024);
    });

    it('refuses a non-positive size ceiling', () => {
      expect(() => parseEnv({ ...valid, VITE_DOCUMENT_MAX_FILE_SIZE_BYTES: '0' })).toThrow(
        /VITE_DOCUMENT_MAX_FILE_SIZE_BYTES/,
      );
    });
  });

  describe('session-timeout policy', () => {
    it('reads the mirrored realm timeouts from the environment', () => {
      const parsed = parseEnv({
        ...valid,
        VITE_SESSION_IDLE_TIMEOUT_SECONDS: '900',
        VITE_SESSION_MAX_LIFETIME_SECONDS: '14400',
        VITE_SESSION_WARNING_SECONDS: '120',
      });
      expect(parsed.sessionIdleTimeoutSeconds).toBe(900);
      expect(parsed.sessionMaxLifetimeSeconds).toBe(14400);
      expect(parsed.sessionWarningSeconds).toBe(120);
    });

    it('treats an empty value as unset rather than zero', () => {
      expect(
        parseEnv({ ...valid, VITE_SESSION_IDLE_TIMEOUT_SECONDS: '' }).sessionIdleTimeoutSeconds,
      ).toBe(1800);
    });

    it('refuses a warning shorter than the 60 s floor', () => {
      expect(() => parseEnv({ ...valid, VITE_SESSION_WARNING_SECONDS: '30' })).toThrow(
        /VITE_SESSION_WARNING_SECONDS/,
      );
    });

    it('refuses a warning that would outlast the idle timeout', () => {
      expect(() =>
        parseEnv({
          ...valid,
          VITE_SESSION_IDLE_TIMEOUT_SECONDS: '120',
          VITE_SESSION_WARNING_SECONDS: '180',
        }),
      ).toThrow(/VITE_SESSION_WARNING_SECONDS/);
    });

    it('refuses an idle timeout longer than the absolute session lifetime', () => {
      expect(() =>
        parseEnv({
          ...valid,
          VITE_SESSION_IDLE_TIMEOUT_SECONDS: '3600',
          VITE_SESSION_MAX_LIFETIME_SECONDS: '1800',
        }),
      ).toThrow(/VITE_SESSION_IDLE_TIMEOUT_SECONDS/);
    });
  });

  it('accepts a missing optional dev role', () => {
    expect(parseEnv(valid).devRole).toBeUndefined();
  });

  it('accepts explicit OIDC redirect overrides and the dev auth switch', () => {
    const parsed = parseEnv({
      ...valid,
      VITE_OIDC_REDIRECT_URI: 'http://localhost:3000/auth/callback',
      VITE_OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:3000/login',
      VITE_DEV_AUTH: 'oidc',
    });
    expect(parsed.oidcRedirectUriOverride).toBe('http://localhost:3000/auth/callback');
    expect(parsed.oidcPostLogoutRedirectUriOverride).toBe('http://localhost:3000/login');
    expect(parsed.devAuth).toBe('oidc');
  });

  it('rejects an unknown dev auth mode', () => {
    expect(() => parseEnv({ ...valid, VITE_DEV_AUTH: 'bypass' })).toThrow(/VITE_DEV_AUTH/);
  });

  it('fails fast with the offending variable named', () => {
    expect(() => parseEnv({ ...valid, VITE_API_BASE_URL: 'not-a-url' })).toThrow(
      /VITE_API_BASE_URL/,
    );
  });

  it('rejects a missing required variable with guidance', () => {
    const { VITE_OIDC_CLIENT_ID: _omitted, ...incomplete } = valid;
    expect(() => parseEnv(incomplete)).toThrow(/VITE_OIDC_CLIENT_ID[\s\S]*\.env\.example/);
  });

  it('rejects an unknown dev role', () => {
    expect(() => parseEnv({ ...valid, VITE_DEV_ROLE: 'SUPERUSER' })).toThrow(/VITE_DEV_ROLE/);
  });
});
