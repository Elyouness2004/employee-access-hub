import { describe, expect, it } from 'vitest';

import { fakeJwt, fakeUser } from '../test-support';
import { decodeJwtPayload, effectiveRoles, identityFromUser } from './claims';

describe('effectiveRoles', () => {
  it.each([
    ['EMPLOYEE', ['EMPLOYEE'], ['EMPLOYEE']],
    ['MANAGER', ['MANAGER', 'EMPLOYEE'], ['MANAGER', 'EMPLOYEE']],
    ['HR', ['HR', 'EMPLOYEE'], ['HR', 'EMPLOYEE']],
    ['ADMIN', ['ADMIN', 'EMPLOYEE'], ['ADMIN', 'EMPLOYEE']],
  ])('maps the composite-expanded %s token', (_label, claim, expected) => {
    expect(effectiveRoles(claim)).toEqual(expected);
  });

  it('drops realm-internal roles that carry no UI meaning', () => {
    expect(
      effectiveRoles([
        'offline_access',
        'MANAGER',
        'uma_authorization',
        'default-roles-employee-hub',
        'EMPLOYEE',
      ]),
    ).toEqual(['MANAGER', 'EMPLOYEE']);
  });

  it('handles an absent realm_access claim', () => {
    expect(effectiveRoles(undefined)).toEqual([]);
  });
});

describe('identityFromUser', () => {
  it('builds the identity from ACCESS-token claims (roles live only there)', () => {
    const identity = identityFromUser(
      fakeUser({
        sub: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
        username: 'mark.manager',
        name: 'Mark Manager',
        roles: ['MANAGER', 'EMPLOYEE'],
      }),
    );

    expect(identity).toEqual({
      subject: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
      username: 'mark.manager',
      displayName: 'Mark Manager',
      roles: ['MANAGER', 'EMPLOYEE'],
    });
  });

  it('falls back to the username when no name claim is present', () => {
    const user = fakeUser({ username: 'hana.hr', name: null, roles: ['HR', 'EMPLOYEE'] });
    expect(identityFromUser(user)?.displayName).toBe('hana.hr');
  });

  it('returns null when the token carries no subject (never a partial identity)', () => {
    const user = fakeUser();
    Object.defineProperty(user, 'access_token', {
      value: fakeJwt({ preferred_username: 'nobody' }),
    });
    Object.defineProperty(user, 'profile', { value: {} });
    expect(identityFromUser(user)).toBeNull();
  });
});

describe('decodeJwtPayload', () => {
  it('decodes UTF-8 payloads', () => {
    expect(decodeJwtPayload(fakeJwt({ name: 'Zoé Müller' }))).toEqual({ name: 'Zoé Müller' });
  });

  it('returns null for malformed tokens rather than throwing', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.b.c')).toBeNull();
  });
});
