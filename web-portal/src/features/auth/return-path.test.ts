import { describe, expect, it } from 'vitest';

import { currentReturnPath, sanitizeReturnPath } from './return-path';

describe('sanitizeReturnPath (open-redirect prevention)', () => {
  it('accepts in-app paths, preserving query and hash', () => {
    expect(sanitizeReturnPath('/leave')).toBe('/leave');
    expect(sanitizeReturnPath('/hr/employees?page=2&sort=name,asc')).toBe(
      '/hr/employees?page=2&sort=name,asc',
    );
    expect(sanitizeReturnPath('/account/sessions#current')).toBe('/account/sessions#current');
  });

  it('rejects absolute URLs (any scheme)', () => {
    expect(sanitizeReturnPath('https://evil.example/phish')).toBe('/');
    expect(sanitizeReturnPath('http://localhost:5173.evil.example/')).toBe('/');
    expect(sanitizeReturnPath('javascript:alert(1)')).toBe('/');
  });

  it('rejects network-path and backslash references', () => {
    expect(sanitizeReturnPath('//evil.example/phish')).toBe('/');
    expect(sanitizeReturnPath('/\\evil.example')).toBe('/');
  });

  it('rejects paths carrying characters the URL parser strips', () => {
    // A tab is dropped during URL parsing, so "/\t/host" would resolve to
    // another origin (and throw at pushState).
    expect(sanitizeReturnPath('/\t/evil.example')).toBe('/');
    expect(sanitizeReturnPath('/\n/evil.example')).toBe('/');
    expect(sanitizeReturnPath('/\r/evil.example')).toBe('/');
    expect(sanitizeReturnPath('/ /evil.example')).toBe('/');
    expect(sanitizeReturnPath('/leave\u007F')).toBe('/');
  });

  it('rejects non-strings and empty values', () => {
    expect(sanitizeReturnPath(undefined)).toBe('/');
    expect(sanitizeReturnPath(null)).toBe('/');
    expect(sanitizeReturnPath(42)).toBe('/');
    expect(sanitizeReturnPath('')).toBe('/');
    expect(sanitizeReturnPath('leave')).toBe('/');
  });

  it('redirects auth plumbing routes to home (no login loops)', () => {
    expect(sanitizeReturnPath('/login')).toBe('/');
    expect(sanitizeReturnPath('/auth/callback')).toBe('/');
    expect(sanitizeReturnPath('/auth/callback?code=x&state=y')).toBe('/');
    expect(sanitizeReturnPath('/auth/silent')).toBe('/');
  });

  it('keeps routes that merely share a prefix with auth routes', () => {
    expect(sanitizeReturnPath('/loginhistory')).toBe('/loginhistory');
  });
});

describe('currentReturnPath', () => {
  it('serializes the router location', () => {
    expect(currentReturnPath({ pathname: '/team', search: '?page=1', hash: '#top' })).toBe(
      '/team?page=1#top',
    );
  });

  it('still sanitizes (a login location never round-trips)', () => {
    expect(currentReturnPath({ pathname: '/login', search: '', hash: '' })).toBe('/');
  });
});
