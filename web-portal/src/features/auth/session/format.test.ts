import { describe, expect, it } from 'vitest';

import { announceRemaining, formatDuration, formatRemaining } from './format';

describe('formatRemaining (the visible countdown)', () => {
  it.each([
    [45, '45 seconds'],
    [1, '1 second'],
    [60, '1 minute'],
    // Never rounds UP: 90 s is not "2 minutes", or the warning hands the user
    // half a minute they do not have.
    [90, '1 minute'],
    [119, '1 minute'],
    [120, '2 minutes'],
  ])('renders %i s as "%s"', (seconds, expected) => {
    expect(formatRemaining(seconds)).toBe(expected);
  });
});

describe('announceRemaining (the spoken range)', () => {
  it('holds one phrase across a whole band so an atomic live region stays quiet', () => {
    expect(announceRemaining(60)).toBe('less than a minute');
    expect(announceRemaining(45)).toBe('less than a minute');
    expect(announceRemaining(4)).toBe('less than a minute');
  });

  it('speaks minutes for longer leads (the unextendable cap), agreeing with the visible figure', () => {
    expect(announceRemaining(300)).toBe('about 5 minutes');
    // Never ahead of what the screen shows: 121 s reads "2 minutes" on both.
    expect(announceRemaining(121)).toBe('about 2 minutes');
    expect(formatRemaining(121)).toBe('2 minutes');
    // Flooring makes 1 reachable, so the singular has to be right.
    expect(announceRemaining(90)).toBe('about 1 minute');
    expect(announceRemaining(119)).toBe('about 1 minute');
  });
});

describe('formatDuration (configured policy values)', () => {
  it.each([
    [1_800_000, '30 minutes'],
    [28_800_000, '8 hours'],
    [3_600_000, '1 hour'],
    [5_400_000, '1 hour 30 minutes'],
    // The configuration floor is 300 s — it must not read as "0 hours".
    [300_000, '5 minutes'],
    [10_000, '10 seconds'],
  ])('renders %i ms as "%s"', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});
