/**
 * documents-service DTOs, transcribed from the Java records (see
 * `src/shared/types/README.md` for why these are hand-written for now).
 *
 * Source files:
 *   services/documents-service/src/main/java/com/hub/documents/api/dto/DocumentResponse.java
 *   .../DocumentMetadataRequest.java · .../CategoryResponse.java · .../CategoryRequest.java
 *   .../domain/AccessRole.java
 */

/**
 * `AccessRole` — the ranked tiers a category's `minRole` is drawn from. HR and
 * ADMIN form the "sensitive" tier (FR-41); a category whose `minRole` is one of
 * them marks its documents sensitive.
 */
export type DocumentAccessRole = 'EMPLOYEE' | 'MANAGER' | 'HR' | 'ADMIN';

/**
 * `DocumentResponse`.
 *
 * Note what is NOT here, because the UI must not pretend otherwise:
 *  - **no `storageKey`** — where the bytes live is the blob store's business.
 *    It exists only on `DocumentDownloadResponse`, which this SPA never calls.
 *  - **no `originalFilename`** — the stored filename reaches a client only
 *    through `Content-Disposition` on `/content`.
 *  - `sizeBytes` and `contentType` are nullable: a metadata-only record (a blob
 *    registered elsewhere) may carry neither.
 */
export interface DocumentResponse {
  id: string;
  title: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  /** Derived server-side from the category tier — never recomputed here. */
  sensitive: boolean;
  /** Keycloak subject of the owner; `null` = company-wide. NEVER an employeeId. */
  ownerKeycloakId: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  /** `preferred_username` of whoever uploaded it. */
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * `DocumentMetadataRequest` — the JSON `metadata` part of a multipart upload and
 * the body of a metadata-only edit. Deliberately carries no `storageKey`.
 */
export interface DocumentMetadataRequest {
  title: string;
  description: string | null;
  categoryId: string;
  /** Optional — omit (null) for a company-wide document. */
  ownerKeycloakId: string | null;
}

/** `CategoryResponse`. `sensitive` is derived from `minRole` being HR or ADMIN. */
export interface DocumentCategoryResponse {
  id: string;
  name: string;
  description: string | null;
  minRole: DocumentAccessRole;
  sensitive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `CategoryRequest` — create/update a category (ADMIN only). */
export interface DocumentCategoryRequest {
  name: string;
  description: string | null;
  minRole: DocumentAccessRole;
}
