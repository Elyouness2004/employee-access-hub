/**
 * Presentation formatting. Everything here is display-only: no value the
 * backend owns is ever recomputed (`businessDays`, audit `result`, notification
 * copy, threshold provenance are rendered exactly as received).
 *
 * Locale is deliberately fixed to `en-GB` rather than the browser's: an
 * enterprise record read by several people should not change shape per reader,
 * and `en-GB` gives unambiguous day-month order. Localization is post-v1
 * (FRONTEND-SPECIFICATION §10).
 */

const LOCALE = 'en-GB';

/** ISO date (`2026-03-14`) → `14 Mar 2026`. Invalid input is returned verbatim. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** ISO instant → `14 Mar 2026, 09:41`. Timestamps are machine data: render mono. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Amount + ISO currency code, as the backend stores them. No conversion, ever:
 * the expense service enforces a single currency per claim and knows nothing
 * about exchange rates — inventing one here would invent money.
 */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // An unknown/absent ISO code must not blank the amount.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** `3 days` / `1 day` — for server-computed `businessDays` only. */
export function formatDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** `14 Mar 2026 – 18 Mar 2026`, collapsing a single-day period to one date. */
export function formatDateRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

/**
 * A UUID shortened for dense display — the first segment only. The full value
 * stays available through `title`, because a shortened id must never be the
 * only copy: these get pasted into log queries.
 */
export function shortId(id: string): string {
  return id.split('-')[0] ?? id;
}

/** Today as an ISO date, for date-input bounds. */
export function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * What the backend actually knows about a device — never more.
 *
 * Keycloak's admin representation carries no browser, OS or device name;
 * hr-service merges in what it stored locally, and for a session it never saw
 * that is nothing. "Unknown device" is the honest floor, and inventing a label
 * from the IP or the session id would be inventing a fact.
 */
export function describeDevice(device: {
  browser: string | null;
  operatingSystem: string | null;
  deviceName: string | null;
}): string {
  const parts = [device.browser, device.operatingSystem].filter(Boolean);
  if (parts.length > 0) return parts.join(' on ');
  return device.deviceName ?? 'Unknown device';
}
