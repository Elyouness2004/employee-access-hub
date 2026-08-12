import { apiClient } from './client';

/**
 * Binary-response readiness (documents `/content`, audit `/export` — Phase 5).
 * The filename comes from Content-Disposition (exposed by CORS); a 404 on
 * `/content` means "metadata-only record", which callers render as a state,
 * not an error.
 */

export interface BinaryResponse {
  blob: Blob;
  filename: string;
}

/**
 * Parse a Content-Disposition header, preferring the RFC 5987 `filename*`
 * form, falling back to plain `filename=`, then to the supplied fallback.
 */
export function filenameFromContentDisposition(
  header: string | undefined,
  fallback: string,
): string {
  if (!header) return fallback;

  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      // fall through to the plain form
    }
  }

  const quoted = /filename\s*=\s*"([^"]+)"/.exec(header);
  if (quoted?.[1]) return quoted[1];

  const bare = /filename\s*=\s*([^;\s]+)/.exec(header);
  if (bare?.[1]) return bare[1];

  return fallback;
}

/** GET a binary resource as a Blob with its server-provided filename. */
export async function fetchBinary(
  url: string,
  options: { fallbackFilename: string; signal?: AbortSignal; params?: Record<string, unknown> },
): Promise<BinaryResponse> {
  const response = await apiClient.get<Blob>(url, {
    responseType: 'blob',
    signal: options.signal,
    ...(options.params ? { params: options.params } : {}),
  });
  const disposition = response.headers['content-disposition'] as string | undefined;
  return {
    blob: response.data,
    filename: filenameFromContentDisposition(disposition, options.fallbackFilename),
  };
}

/**
 * Hand a fetched blob to the browser's download machinery.
 *
 * A synthetic `<a download>` click rather than `window.open` or a location
 * change, for two reasons that matter here: the bytes were fetched with the
 * `Authorization` header (a navigation carries no header and would 401), and
 * the page must not navigate away from a form the user is in the middle of.
 * The object URL is revoked immediately after the click — the browser has
 * already taken its reference, and leaving it alive pins the whole file in
 * memory for the life of the document.
 */
export function saveBlob({ blob, filename }: BinaryResponse): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
