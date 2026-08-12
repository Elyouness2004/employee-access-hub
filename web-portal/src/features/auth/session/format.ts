/**
 * Time wording for the session-timeout UI. Two audiences, two rules.
 *
 * The VISIBLE countdown ticks and must never overstate: rounding 90 s up to
 * "2 minutes" gives the user time they do not have, so minutes always round
 * down.
 *
 * The ANNOUNCED text is a range, not a stopwatch. `role="alert"` carries an
 * implicit `aria-atomic`, so a value that changed every second would re-announce
 * the whole banner every second; and a value frozen at its first reading lies to
 * anyone who reaches the banner later. A range is true for its whole band and
 * changes at most once a minute.
 */

/** Visible countdown: "45 seconds" · "1 minute" · "4 minutes" (never rounded up). */
export function formatRemaining(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

/**
 * Announced equivalent: honest at every point in its band, quiet between bands,
 * and — like the visible figure — never rounded UP. A screen-reader user hearing
 * "about 3 minutes" while the screen reads "2 minutes" is being given time that
 * does not exist, and they are the one who cannot check.
 */
export function announceRemaining(seconds: number): string {
  if (seconds > 60) {
    const minutes = Math.floor(seconds / 60);
    return `about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  return 'less than a minute';
}

/**
 * A configured duration in words: "30 minutes" · "1 hour" · "8 hours" ·
 * "1 hour 30 minutes". Falls back to seconds below a minute so a short test or
 * demo policy reads as itself rather than as a rounded-up "1 minutes".
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds} ${totalSeconds === 1 ? 'second' : 'seconds'}`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} ${totalMinutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourPart = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return minutes === 0 ? hourPart : `${hourPart} ${minutes} minutes`;
}
