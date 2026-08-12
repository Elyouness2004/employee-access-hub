import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import { apiClient } from '@/shared/api';
import {
  documentCategoryFixtures,
  documentFixture,
  metadataOnlyDocumentFixture,
  pageOf,
  sensitiveDocumentFixture,
} from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderAtRoute, renderWithProviders } from '@/shared/testing/render';

import { DocumentAdminPage } from './pages/DocumentAdminPage';
import { DocumentCategoriesPage } from './pages/DocumentCategoriesPage';
import { DocumentsPage } from './pages/DocumentsPage';

/**
 * P10 · P22 · P25 — the documents surface.
 *
 * The contract facts under test: server paging/sorting with the whitelist, the
 * FR-41 access story rendered rather than recomputed, the multipart upload with
 * its 413/415 paths, `Content-Disposition` naming the saved file, 404-on-content
 * meaning "metadata only" and not an error, and the role split between reading,
 * managing and administering categories.
 */

const DOCUMENTS = `${env.apiBaseUrl}/api/documents`;
const CATEGORIES = `${env.apiBaseUrl}/api/documents/categories`;

/** jsdom implements neither; the download path is asserted through them. */
const createObjectURL = vi.fn(() => 'blob:mock');
const revokeObjectURL = vi.fn();

/** jsdom's `Blob` has no `text()`; `FileReader` is the floor everywhere. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, 'createObjectURL', { writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: revokeObjectURL });
});

describe('documents library (P10)', () => {
  it('renders the paged list with sort affordances only on the whitelisted columns', async () => {
    const { container } = renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });

    expect(await screen.findByRole('button', { name: documentFixture.title })).toBeVisible();

    const table = screen.getByRole('table', { name: /documents you can access/i });
    // DocumentController.SORTABLE = title, createdAt, updatedAt, sizeBytes.
    expect(within(table).getByRole('button', { name: /title/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /size/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /added/i })).toBeVisible();
    // Category and owner are not sortable server-side — they must not look it.
    expect(within(table).queryByRole('button', { name: /^category/i })).toBeNull();
    expect(within(table).queryByRole('button', { name: /belongs to/i })).toBeNull();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('sends page, size and the default sort to the server', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(DOCUMENTS, ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json(pageOf([documentFixture], { totalElements: 61 }));
      }),
    );

    renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });
    await screen.findByRole('button', { name: documentFixture.title });

    expect(requests[0]?.searchParams.get('page')).toBe('0');
    expect(requests[0]?.searchParams.get('size')).toBe('20');
    expect(requests[0]?.searchParams.get('sort')).toBe('createdAt,desc');
    expect(screen.getByText(/showing 1–1 of 61 documents/i)).toBeVisible();
  });

  it('marks a sensitive document with a lock badge, not colour alone', async () => {
    renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });
    await screen.findByRole('button', { name: sensitiveDocumentFixture.title });
    expect(screen.getAllByTitle('SENSITIVE_DOCUMENT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sensitive').length).toBeGreaterThan(0);
  });

  it('does not offer a category filter to a role that cannot read the catalogue', async () => {
    renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });
    await screen.findByRole('button', { name: documentFixture.title });

    expect(screen.queryByLabelText('Category')).toBeNull();
    expect(screen.getByText(/filtering by category is not offered here/i)).toBeVisible();
  });

  it('filters by owner using the caller’s Keycloak subject, not an employeeId', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(DOCUMENTS, ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json(pageOf([documentFixture]));
      }),
    );

    const { router } = renderAtRoute('/documents', <DocumentsPage />, {
      role: 'EMPLOYEE',
      route: '/documents',
    });
    await screen.findByRole('button', { name: documentFixture.title });

    await userEvent.selectOptions(screen.getByLabelText('Owner'), 'mine');

    await waitFor(() =>
      expect(requests.at(-1)?.searchParams.get('ownerKeycloakId')).toBe('test-subject-employee'),
    );
    expect(router.state.location.search).toContain('owner=mine');
  });

  it('explains WHY a document is reachable — company-wide vs owned vs sensitive', async () => {
    renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });
    await userEvent.click(await screen.findByRole('button', { name: documentFixture.title }));

    const dialog = await screen.findByRole('dialog');
    // Twice over: the "Belongs to" fact and the access panel's explanation.
    expect(within(dialog).getAllByText(/company-wide/i).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/sets the minimum role required/i)).toBeVisible();
    // The uploader is a login in the record; the resolver names the person.
    expect(await within(dialog).findByText('Ilham Aboulkacem')).toBeVisible();
  });

  it('renders null size and type as "—" rather than inventing a zero', async () => {
    server.use(http.get(DOCUMENTS, () => HttpResponse.json(pageOf([metadataOnlyDocumentFixture]))));
    renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });

    await screen.findByRole('button', { name: metadataOnlyDocumentFixture.title });
    expect(screen.queryByText('0 B')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('distinguishes an empty library from filters that match nothing', async () => {
    server.use(http.get(DOCUMENTS, () => HttpResponse.json(pageOf([]))));

    const { unmount } = renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });
    expect(await screen.findByText(/no documents are shared with you/i)).toBeVisible();
    unmount();

    renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE', route: '/documents?search=zzz' });
    expect(await screen.findByText(/no documents match these filters/i)).toBeVisible();
  });

  it('renders a 403 inline with the server’s FR-41 sentence and the correlation id', async () => {
    server.use(
      http.get(DOCUMENTS, () =>
        problemResponse(403, { detail: 'not allowed to access this document' }, 'corr-doc-403'),
      ),
    );
    renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });

    expect(await screen.findByText('not allowed to access this document')).toBeVisible();
    expect(screen.getByText('corr-doc-403', { exact: false })).toBeVisible();
  });

  it('reads 503 as a dependency to wait for, not as a failed request', async () => {
    server.use(
      http.get(DOCUMENTS, () =>
        problemResponse(503, {
          title: 'Document storage unavailable',
          detail: 'the blob store is unreachable',
        }),
      ),
    );
    renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });

    expect(await screen.findByText(/the blob store is unreachable/i)).toBeVisible();
    expect(screen.getByText(/try again shortly/i)).toBeVisible();
  });

  it('hides the management surface from a role that cannot write', async () => {
    renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });
    await screen.findByRole('button', { name: documentFixture.title });

    expect(screen.queryByRole('button', { name: /upload document/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^delete /i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^edit details/i })).toBeNull();
  });
});

describe('document download', () => {
  it('saves the file under the name Content-Disposition gave it', async () => {
    renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });
    const rows = await screen.findAllByRole('button', { name: /^download /i });

    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await userEvent.click(rows[0]!);

    await waitFor(() => expect(anchorClick).toHaveBeenCalled());
    const anchor = anchorClick.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('employee-handbook-2026.pdf');
    expect(createObjectURL).toHaveBeenCalled();
    // The object URL is released immediately — a retained one pins the file.
    expect(revokeObjectURL).toHaveBeenCalled();
    anchorClick.mockRestore();
  });

  it('calls 404 on /content "metadata only" rather than an error', async () => {
    server.use(
      http.get(`${DOCUMENTS}/:id/content`, () =>
        problemResponse(404, { title: 'Resource not found', detail: 'document content not found' }),
      ),
    );
    renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });
    const rows = await screen.findAllByRole('button', { name: /^download /i });

    await userEvent.click(rows[0]!);

    expect(await screen.findByText(/metadata only/i)).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces a 403 on the bytes with the server’s wording', async () => {
    server.use(
      http.get(`${DOCUMENTS}/:id/content`, () =>
        problemResponse(403, { detail: 'not allowed to access this document' }, 'corr-bytes-403'),
      ),
    );
    renderWithProviders(<DocumentsPage />, { role: 'EMPLOYEE' });
    const rows = await screen.findAllByRole('button', { name: /^download /i });

    await userEvent.click(rows[0]!);

    expect(await screen.findByText(/not allowed to access this document/i)).toBeVisible();
    expect(screen.getByText(/corr-bytes-403/)).toBeVisible();
  });
});

describe('document admin (P22)', () => {
  it('offers the write surface and the category filter to HR', async () => {
    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });

    expect(await screen.findByRole('button', { name: documentFixture.title })).toBeVisible();
    expect(screen.getByRole('button', { name: /upload document/i })).toBeVisible();
    expect(await screen.findByLabelText('Category')).toBeVisible();
    expect(screen.queryByText(/filtering by category is not offered here/i)).toBeNull();
  });

  it('states the size limit and the MIME allowlist before a file is chosen', async () => {
    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });
    await userEvent.click(await screen.findByRole('button', { name: /upload document/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/up to 10 MB/i)).toBeVisible();
    expect(within(dialog).getByText(/PDF, PNG, JPEG/i)).toBeVisible();
    expect(within(dialog).getByText(/the server has the final say/i)).toBeVisible();
  });

  /**
   * The multipart body is inspected on the way OUT, through a temporary
   * interceptor on the app's own client, rather than by re-parsing it in the
   * MSW handler.
   *
   * Not a mock: MSW still serves the response and no axios behaviour is
   * replaced. It is a workaround for one environment gap — jsdom's
   * `XMLHttpRequest` hands the interceptor a `FormData` it cannot re-encode, so
   * `request.formData()` on the server side sees `text/plain` and the string
   * "[object FormData]" no matter what the client sent. Asserting there would
   * test jsdom. Asserting here tests the thing that actually has to be right:
   * that the SPA builds a `file` part plus a JSON-typed `metadata` part, which
   * is what Spring's `@RequestPart` needs to deserialize.
   */
  it('exposes the file input itself — one tab stop, with the global focus ring', async () => {
    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });
    await userEvent.click(await screen.findByRole('button', { name: /upload document/i }));
    const dialog = await screen.findByRole('dialog');

    const input = within(dialog).getByLabelText('File');
    expect(input).toBeVisible();
    // Not hidden behind a styled button: an off-screen control is focusable
    // with no visible ring (WCAG 2.4.7) and adds a second tab stop.
    expect(input).not.toHaveClass('sr-only');
    expect(within(dialog).queryByRole('button', { name: /choose file/i })).toBeNull();
  });

  it('keeps the upload percentage out of a live region', async () => {
    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });
    await userEvent.click(await screen.findByRole('button', { name: /upload document/i }));
    const dialog = await screen.findByRole('dialog');

    // Nothing in the uploader announces a value that changes per progress
    // event; the progressbar carries it via aria-valuenow instead.
    for (const region of within(dialog).queryAllByLabelText(/upload progress/i)) {
      expect(region).toHaveAttribute('role', 'progressbar');
    }
  });

  it('sends a real multipart body: a file part plus a JSON metadata part', async () => {
    let received: FormData | null = null;
    const interceptor = apiClient.interceptors.request.use((config) => {
      if (config.data instanceof FormData) received = config.data;
      return config;
    });
    server.use(http.post(DOCUMENTS, () => HttpResponse.json(documentFixture, { status: 201 })));

    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });
    await userEvent.click(await screen.findByRole('button', { name: /upload document/i }));
    const dialog = await screen.findByRole('dialog');

    const file = new File(['%PDF-1.4'], 'handbook.pdf', { type: 'application/pdf' });
    await userEvent.upload(within(dialog).getByLabelText('File'), file);
    await userEvent.type(within(dialog).getByLabelText(/title/i), 'Handbook');
    await userEvent.selectOptions(
      within(dialog).getByLabelText(/category/i),
      documentCategoryFixtures[0]!.id,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /upload document/i }));

    await waitFor(() => expect(received).not.toBeNull());
    apiClient.interceptors.request.eject(interceptor);

    const form = received as unknown as FormData;
    expect((form.get('file') as File).name).toBe('handbook.pdf');
    const metadataPart = form.get('metadata') as Blob;
    // Spring's @RequestPart deserializes only when the part is JSON-typed.
    expect(metadataPart.type).toBe('application/json');
    const metadata = JSON.parse(await readBlob(metadataPart));
    expect(metadata).toEqual({
      title: 'Handbook',
      description: null,
      categoryId: documentCategoryFixtures[0]!.id,
      // Company-wide by default — the record's optional owner, omitted.
      ownerKeycloakId: null,
    });
  });

  it('refuses an over-size file before spending the upload, quoting the configured limit', async () => {
    const posted = vi.fn();
    server.use(
      http.post(DOCUMENTS, () => {
        posted();
        return HttpResponse.json(documentFixture, { status: 201 });
      }),
    );

    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });
    await userEvent.click(await screen.findByRole('button', { name: /upload document/i }));
    const dialog = await screen.findByRole('dialog');

    const huge = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 });
    await userEvent.upload(within(dialog).getByLabelText('File'), huge);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/accepts up to 10 MB/i);
    expect(posted).not.toHaveBeenCalled();
  });

  it('refuses a MIME type outside the allowlist before spending the upload', async () => {
    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });
    await userEvent.click(await screen.findByRole('button', { name: /upload document/i }));
    const dialog = await screen.findByRole('dialog');

    const bad = new File(['MZ'], 'tool.exe', { type: 'application/x-msdownload' });
    // `accept` is a picker hint the user can always override, so the test
    // overrides it too — the point is that the CHECK refuses the file.
    await userEvent.upload(within(dialog).getByLabelText('File'), bad, { applyAccept: false });

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/not on this deployment/i);
  });

  it('lands the server’s 413 on the file control, keeping the typed metadata', async () => {
    server.use(
      http.post(DOCUMENTS, () =>
        problemResponse(413, {
          title: 'File too large',
          detail: 'file is 12000000 bytes; the limit is 10485760 bytes',
        }),
      ),
    );

    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });
    await userEvent.click(await screen.findByRole('button', { name: /upload document/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.upload(
      within(dialog).getByLabelText('File'),
      new File(['%PDF'], 'ok.pdf', { type: 'application/pdf' }),
    );
    await userEvent.type(within(dialog).getByLabelText(/title/i), 'Big file');
    await userEvent.selectOptions(
      within(dialog).getByLabelText(/category/i),
      documentCategoryFixtures[0]!.id,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /upload document/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/the limit is 10485760/i);
    // Input survives the failure — nothing has to be retyped.
    expect(within(dialog).getByLabelText(/title/i)).toHaveValue('Big file');
  });

  it('lands the server’s 415 on the file control', async () => {
    server.use(
      http.post(DOCUMENTS, () =>
        problemResponse(415, {
          title: 'Unsupported file type',
          detail: 'application/zip is not an accepted document type',
        }),
      ),
    );

    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });
    await userEvent.click(await screen.findByRole('button', { name: /upload document/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.upload(
      within(dialog).getByLabelText('File'),
      new File(['%PDF'], 'ok.pdf', { type: 'application/pdf' }),
    );
    await userEvent.type(within(dialog).getByLabelText(/title/i), 'Archive');
    await userEvent.selectOptions(
      within(dialog).getByLabelText(/category/i),
      documentCategoryFixtures[0]!.id,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /upload document/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/application\/zip/i);
  });

  it('maps a 400 validation error onto the field that produced it', async () => {
    server.use(
      http.post(DOCUMENTS, () =>
        problemResponse(400, {
          title: 'Validation failed',
          detail: 'One or more request fields are invalid',
          errors: { title: 'must not be blank' },
        }),
      ),
    );

    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });
    await userEvent.click(await screen.findByRole('button', { name: /upload document/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.upload(
      within(dialog).getByLabelText('File'),
      new File(['%PDF'], 'ok.pdf', { type: 'application/pdf' }),
    );
    await userEvent.type(within(dialog).getByLabelText(/title/i), 'x');
    await userEvent.selectOptions(
      within(dialog).getByLabelText(/category/i),
      documentCategoryFixtures[0]!.id,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /upload document/i }));

    expect(await within(dialog).findByText('must not be blank')).toBeVisible();
  });

  it('requires a Keycloak subject — not an employeeId — for a personal document', async () => {
    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });
    await userEvent.click(await screen.findByRole('button', { name: /upload document/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.selectOptions(within(dialog).getByLabelText(/who it belongs to/i), 'PERSON');
    const owner = within(dialog).getByLabelText(/owner — keycloak subject/i);
    await userEvent.type(owner, 'EMP-0042');
    await userEvent.tab();

    expect(await within(dialog).findByText(/that is not a keycloak subject/i)).toBeVisible();
  });

  it('names the consequences before deleting — including that the bytes go too', async () => {
    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });
    const deleteButtons = await screen.findAllByRole('button', { name: /^delete /i });

    await userEvent.click(deleteButtons[0]!);

    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getAllByText(new RegExp(documentFixture.title, 'i')).length,
    ).toBeGreaterThan(0);
    expect(within(dialog).getByText(/the stored file is deleted with it/i)).toBeVisible();
  });

  it('does not offer to replace the stored bytes when editing metadata', async () => {
    renderWithProviders(<DocumentAdminPage />, { role: 'HR' });
    const editButtons = await screen.findAllByRole('button', { name: /^edit details/i });

    await userEvent.click(editButtons[0]!);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('File')).toBeNull();
    expect(
      within(dialog).getByText(/the stored file itself is left exactly as it is/i),
    ).toBeVisible();
  });
});

describe('document categories (P25)', () => {
  it('renders the catalogue with whitelisted sorts and marks sensitive tiers', async () => {
    const { container } = renderWithProviders(<DocumentCategoriesPage />, { role: 'ADMIN' });

    expect(await screen.findByText('Company policies')).toBeVisible();
    const table = screen.getByRole('table', { name: /document categories/i });
    expect(within(table).getByRole('button', { name: /name/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /minimum role/i })).toBeVisible();
    // `description` is not in DocumentCategoryController.SORTABLE.
    expect(within(table).queryByRole('button', { name: /description/i })).toBeNull();

    expect(screen.getAllByText('Sensitive').length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('warns that an HR/ADMIN minimum role marks the category sensitive', async () => {
    renderWithProviders(<DocumentCategoriesPage />, { role: 'ADMIN' });
    await userEvent.click(await screen.findByRole('button', { name: /new category/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByText(/marks the category sensitive/i)).toBeNull();
    await userEvent.selectOptions(within(dialog).getByLabelText(/minimum role/i), 'HR');
    expect(await within(dialog).findByText(/marks the category sensitive/i)).toBeVisible();
  });

  it('explains a 409 delete-in-use inside the confirmation, not as a toast', async () => {
    server.use(
      http.delete(`${CATEGORIES}/:id`, () =>
        problemResponse(
          409,
          { title: 'Conflict', detail: 'category still has documents' },
          'corr-cat-409',
        ),
      ),
    );

    renderWithProviders(<DocumentCategoriesPage />, { role: 'ADMIN' });
    const deleteButtons = await screen.findAllByRole('button', { name: /^delete /i });
    await userEvent.click(deleteButtons[0]!);

    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /delete category/i }));

    expect(await within(dialog).findByText(/category still has documents/i)).toBeVisible();
    expect(within(dialog).getByText(/corr-cat-409/)).toBeVisible();
  });

  it('reports a duplicate name on the field that collided', async () => {
    server.use(
      http.post(CATEGORIES, () =>
        problemResponse(400, {
          title: 'Validation failed',
          detail: 'One or more request fields are invalid',
          errors: { name: 'a category with this name already exists' },
        }),
      ),
    );

    renderWithProviders(<DocumentCategoriesPage />, { role: 'ADMIN' });
    await userEvent.click(await screen.findByRole('button', { name: /new category/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'HR records');
    await userEvent.click(within(dialog).getByRole('button', { name: /create category/i }));

    expect(await within(dialog).findByText(/already exists/i)).toBeVisible();
  });
});
