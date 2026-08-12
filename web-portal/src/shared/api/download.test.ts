import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { env } from '@/config/env';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';

import { fetchBinary, filenameFromContentDisposition, saveBlob } from './download';
import { correlationIdOf, isApiError, type ApiError } from './problem';

describe('filenameFromContentDisposition', () => {
  it('falls back when the header is absent', () => {
    expect(filenameFromContentDisposition(undefined, 'document.bin')).toBe('document.bin');
  });

  it('reads a quoted filename', () => {
    expect(
      filenameFromContentDisposition('attachment; filename="audit-export.csv"', 'fallback'),
    ).toBe('audit-export.csv');
  });

  it('reads a bare filename', () => {
    expect(filenameFromContentDisposition('attachment; filename=handbook.pdf', 'fallback')).toBe(
      'handbook.pdf',
    );
  });

  it('prefers the RFC 5987 UTF-8 form and decodes it', () => {
    expect(
      filenameFromContentDisposition(
        `attachment; filename="fallback.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`,
        'fallback',
      ),
    ).toBe('résumé.pdf');
  });

  it('survives a malformed encoded filename', () => {
    expect(
      filenameFromContentDisposition(`attachment; filename*=UTF-8''%E0%A4%ZZ`, 'fallback.bin'),
    ).toBe('fallback.bin');
  });
});

/**
 * Binary responses and their failures (Phase 5: document content, audit CSV).
 *
 * The failure half matters as much as the success half: a request made with
 * `responseType: 'blob'` hands back the RFC 7807 problem document AS A BLOB, so
 * without the client's blob-aware normalization every failed download would
 * reach the UI as a bare status — no `detail`, no `errors`, no `rule`.
 */
describe('fetchBinary', () => {
  const CONTENT = `${env.apiBaseUrl}/api/documents/abc/content`;

  it('returns the bytes with the filename Content-Disposition supplied', async () => {
    server.use(
      http.get(
        CONTENT,
        () =>
          new HttpResponse(new Blob(['%PDF-1.4']), {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': 'attachment; filename="handbook.pdf"',
            },
          }),
      ),
    );

    const result = await fetchBinary('/api/documents/abc/content', {
      fallbackFilename: 'fallback.pdf',
    });

    expect(result.filename).toBe('handbook.pdf');
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('falls back to the supplied name when the server sent no disposition', async () => {
    server.use(
      http.get(
        CONTENT,
        () =>
          new HttpResponse(new Blob(['x']), {
            headers: { 'Content-Type': 'application/octet-stream' },
          }),
      ),
    );

    const result = await fetchBinary('/api/documents/abc/content', {
      fallbackFilename: 'Employee handbook',
    });
    expect(result.filename).toBe('Employee handbook');
  });

  it('normalizes a problem document delivered as a blob into a typed error', async () => {
    server.use(
      http.get(CONTENT, () =>
        problemResponse(
          403,
          { title: 'Forbidden', detail: 'not allowed to access this document' },
          'corr-blob-403',
        ),
      ),
    );

    const error = await fetchBinary('/api/documents/abc/content', {
      fallbackFilename: 'x.pdf',
    }).catch((thrown: unknown) => thrown);

    expect(isApiError(error)).toBe(true);
    const typed = error as ApiError & { detail?: string };
    expect(typed.kind).toBe('forbidden');
    // Without the blob-aware read this would be the generic 'Access denied.'
    expect(typed.detail).toBe('not allowed to access this document');
    expect(correlationIdOf(error)).toBe('corr-blob-403');
  });

  it('keeps a 404 on /content as notFound — the caller renders "metadata only"', async () => {
    server.use(
      http.get(CONTENT, () =>
        problemResponse(404, { title: 'Resource not found', detail: 'document content not found' }),
      ),
    );

    const error = await fetchBinary('/api/documents/abc/content', {
      fallbackFilename: 'x.pdf',
    }).catch((thrown: unknown) => thrown);

    expect((error as ApiError).kind).toBe('notFound');
  });

  it('leaves a non-JSON error body alone rather than inventing a message', async () => {
    server.use(
      http.get(
        CONTENT,
        () =>
          new HttpResponse('<html>gateway error</html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );

    const error = await fetchBinary('/api/documents/abc/content', {
      fallbackFilename: 'x.pdf',
    }).catch((thrown: unknown) => thrown);

    expect((error as ApiError).kind).toBe('provisioningFailed');
    expect(isApiError(error)).toBe(true);
  });
});

describe('saveBlob', () => {
  it('downloads through an anchor and releases the object URL immediately', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    saveBlob({ blob: new Blob(['a']), filename: 'audit-export.csv' });

    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('audit-export.csv');
    // A navigation would carry no Authorization header and would leave the page;
    // an anchor click does neither.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    // Nothing is left attached to the document.
    expect(document.querySelector('a[download]')).toBeNull();
    click.mockRestore();
  });
});
