package com.hub.documents.application;

import java.io.InputStream;
import java.util.List;
import java.util.UUID;

import com.hub.documents.api.dto.DocumentDownloadResponse;
import com.hub.documents.api.dto.DocumentMetadataRequest;
import com.hub.documents.api.dto.DocumentResponse;
import com.hub.documents.api.dto.DocumentsStatsResponse;
import com.hub.documents.api.dto.OffboardingResult;
import com.hub.documents.api.dto.PageResponse;
import com.hub.documents.api.dto.UploadDocumentRequest;
import com.hub.documents.domain.AccessRole;
import com.hub.documents.domain.Document;
import com.hub.documents.domain.DocumentCategory;
import com.hub.documents.domain.storage.DocumentStorage;
import com.hub.documents.domain.storage.StoredBlob;
import com.hub.documents.infrastructure.AuditLogRepository;
import com.hub.documents.infrastructure.DocumentCategoryRepository;
import com.hub.documents.infrastructure.DocumentRepository;
import com.hub.documents.infrastructure.DocumentSpecifications;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Document use cases. Coarse RBAC (upload/update/delete are HR/Admin) lives in
 * the controllers; the FR-41 access rule — category role gate AND ownership —
 * is enforced here per document. Every download is audit-logged, whether the
 * caller resolved a reference or streamed the bytes.
 */
@Service
@Transactional
public class DocumentService {

    private static final String DOWNLOAD_ACTION = "DOCUMENT_DOWNLOADED";
    private static final String UPLOAD_ACTION = "DOCUMENT_UPLOADED";
    private static final String UPDATE_ACTION = "DOCUMENT_UPDATED";

    private final DocumentRepository documents;
    private final DocumentCategoryRepository categories;
    private final AuditLogRepository auditLog;
    private final AuditTrail audit;
    private final DocumentStorage storage;
    private final DocumentUploadPolicy uploadPolicy;

    public DocumentService(DocumentRepository documents,
                           DocumentCategoryRepository categories,
                           AuditLogRepository auditLog,
                           AuditTrail audit,
                           DocumentStorage storage,
                           DocumentUploadPolicy uploadPolicy) {
        this.documents = documents;
        this.categories = categories;
        this.auditLog = auditLog;
        this.audit = audit;
        this.storage = storage;
        this.uploadPolicy = uploadPolicy;
    }

    /**
     * The documents the caller may access, paged. The access rule is pushed into
     * the query (see {@code DocumentSpecifications#accessibleBy}) rather than
     * applied to a fetched page, so page size and total count are both truthful.
     */
    @Transactional(readOnly = true)
    public PageResponse<DocumentResponse> page(Actor actor, DocumentFilter filter, Pageable pageable) {
        return PageResponse.from(
                documents.findAll(
                        DocumentSpecifications.accessibleBy(actor.keycloakId(), actor.role())
                                .and(DocumentSpecifications.matching(filter)),
                        pageable),
                DocumentResponse::from);
    }

    @Transactional(readOnly = true)
    public DocumentResponse get(Actor actor, UUID id) {
        return DocumentResponse.from(requireAccessible(actor, id));
    }

    /** FR-41: authorize, then audit the download in the same transaction. */
    public DocumentDownloadResponse download(Actor actor, UUID id) {
        Document document = requireAccessible(actor, id);
        auditDownload(actor, document);
        return DocumentDownloadResponse.from(document);
    }

    /**
     * FR-41 for the bytes themselves: authorize, open the blob, then audit — in
     * that order, so a document whose blob is missing 404s without leaving a
     * download in the trail. A record that holds only metadata for a blob this
     * service never received is exactly that case.
     */
    public DocumentContent content(Actor actor, UUID id) {
        Document document = requireAccessible(actor, id);
        InputStream stream = storage.open(document.getStorageKey())
                .orElseThrow(() -> new ResourceNotFoundException("document content", id));
        auditDownload(actor, document);
        return new DocumentContent(document.downloadFilename(), document.getContentType(),
                document.getSizeBytes(), stream);
    }

    /**
     * Real upload: the file is validated against the deployment policy (size,
     * MIME allowlist), stored under a generated key, and only then recorded — so
     * a rejected upload leaves neither bytes nor a row behind.
     */
    public DocumentResponse upload(Actor actor, DocumentMetadataRequest metadata, UploadedFile file) {
        DocumentCategory category = requireCategory(metadata.categoryId());
        String contentType = uploadPolicy.validate(file.contentType(), file.sizeBytes());
        StoredBlob blob = storage.store(file.originalFilename(), file.content());
        Document document = Document.uploaded(metadata.title(), metadata.description(), category,
                metadata.ownerKeycloakId(), blob.storageKey(), contentType, blob.sizeBytes(),
                file.originalFilename(), actor.username());
        documents.save(document);
        audit.record(actor.username(), UPLOAD_ACTION, "document:" + document.getId(),
                "title=" + metadata.title() + " category=" + category.getName()
                        + " bytes=" + blob.sizeBytes());
        return DocumentResponse.from(document);
    }

    /** Registers metadata for a blob written outside this service (pre-existing contract). */
    public DocumentResponse upload(Actor actor, UploadDocumentRequest request) {
        DocumentCategory category = requireCategory(request.categoryId());
        Document document = new Document(request.title(), request.description(), category,
                request.ownerKeycloakId(), request.storageKey(), request.contentType(),
                request.sizeBytes(), actor.username());
        documents.save(document);
        audit.record(actor.username(), UPLOAD_ACTION, "document:" + document.getId(),
                "title=" + request.title() + " category=" + category.getName());
        return DocumentResponse.from(document);
    }

    public DocumentResponse update(Actor actor, UUID id, UploadDocumentRequest request) {
        Document document = require(id);
        DocumentCategory category = requireCategory(request.categoryId());
        document.update(request.title(), request.description(), category, request.ownerKeycloakId(),
                request.storageKey(), request.contentType(), request.sizeBytes());
        audit.record(actor.username(), UPDATE_ACTION, "document:" + id,
                "title=" + request.title() + " category=" + category.getName());
        return DocumentResponse.from(document);
    }

    /** Metadata-only edit: the stored bytes stay where they are (no orphaned blob). */
    public DocumentResponse updateMetadata(Actor actor, UUID id, DocumentMetadataRequest request) {
        Document document = require(id);
        DocumentCategory category = requireCategory(request.categoryId());
        document.updateMetadata(request.title(), request.description(), category, request.ownerKeycloakId());
        audit.record(actor.username(), UPDATE_ACTION, "document:" + id,
                "title=" + request.title() + " category=" + category.getName());
        return DocumentResponse.from(document);
    }

    /** Deletes the record and the bytes it points at; the audit entry records both outcomes. */
    public void delete(Actor actor, UUID id) {
        Document document = require(id);
        String storageKey = document.getStorageKey();
        documents.delete(document);
        boolean contentDeleted = storage.delete(storageKey);
        audit.record(actor.username(), "DOCUMENT_DELETED", "document:" + id,
                "contentDeleted=" + contentDeleted);
    }

    /** Aggregate KPIs for the analytics context (P6.2). */
    @Transactional(readOnly = true)
    public DocumentsStatsResponse stats() {
        long total = documents.count();
        long sensitive = documents.countByCategory_MinRoleIn(List.of(AccessRole.HR, AccessRole.ADMIN));
        long totalCategories = categories.count();
        long downloads = auditLog.countByAction(DOWNLOAD_ACTION);
        return new DocumentsStatsResponse(total, sensitive, totalCategories, downloads);
    }

    /**
     * Offboarding consumer (P3.3): revoke the departed employee's ownership over
     * their documents (they pass into company/HR custody). Nothing is deleted —
     * the metadata and its audit trail are preserved.
     */
    public OffboardingResult offboard(Actor actor, UUID employeeKeycloakId) {
        int revoked = 0;
        for (Document document : documents.findAllByOwnerKeycloakId(employeeKeycloakId)) {
            if (document.revokeOwnership()) {
                revoked++;
            }
        }
        audit.record(actor.username(), "DOCUMENT_OFFBOARDING_REVOCATION", "employee:" + employeeKeycloakId,
                "ownershipRevoked=" + revoked);
        return new OffboardingResult(revoked);
    }

    /** One shape of download entry whichever endpoint served it — the trail stays uniform. */
    private void auditDownload(Actor actor, Document document) {
        audit.record(actor.username(), DOWNLOAD_ACTION, "document:" + document.getId(),
                "title=" + document.getTitle() + (document.isSensitive() ? " sensitive=true" : ""));
    }

    private Document requireAccessible(Actor actor, UUID id) {
        Document document = require(id);
        if (!document.isAccessibleBy(actor.keycloakId(), actor.role())) {
            throw new AccessDeniedException("not allowed to access this document");
        }
        return document;
    }

    private Document require(UUID id) {
        return documents.findById(id).orElseThrow(() -> new ResourceNotFoundException("document", id));
    }

    private DocumentCategory requireCategory(UUID id) {
        return categories.findById(id)
                .orElseThrow(() -> new InvalidReferenceException("category " + id + " does not exist"));
    }
}
