package com.hub.documents.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.UuidGenerator;

/**
 * Document metadata aggregate. The bytes themselves live in the blob store
 * behind {@code DocumentStorage}; {@code storageKey} is the pointer to them, so
 * the aggregate is unchanged whether the blob was uploaded here or written by
 * something else. Access is a pure domain rule: category role gate AND
 * ownership (FR-41).
 */
@Entity
@Table(name = "document")
public class Document {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 500)
    private String description;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private DocumentCategory category;

    /** Keycloak subject of the employee the document belongs to; null = company-wide. */
    @Column(name = "owner_keycloak_id")
    private UUID ownerKeycloakId;

    /** Reference to the blob in storage (the aggregate itself holds no bytes). */
    @Column(name = "storage_key", nullable = false, length = 500)
    private String storageKey;

    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    /** Filename as uploaded — used for the download's Content-Disposition; null for metadata-only records. */
    @Column(name = "original_filename", length = 255)
    private String originalFilename;

    @Column(name = "uploaded_by", nullable = false, length = 255)
    private String uploadedBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Document() {
        // JPA only
    }

    public Document(String title, String description, DocumentCategory category, UUID ownerKeycloakId,
                    String storageKey, String contentType, Long sizeBytes, String uploadedBy) {
        this.uploadedBy = Objects.requireNonNull(uploadedBy, "uploadedBy");
        update(title, description, category, ownerKeycloakId, storageKey, contentType, sizeBytes);
    }

    public void update(String title, String description, DocumentCategory category, UUID ownerKeycloakId,
                       String storageKey, String contentType, Long sizeBytes) {
        updateMetadata(title, description, category, ownerKeycloakId);
        this.storageKey = Objects.requireNonNull(storageKey, "storageKey");
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
    }

    /**
     * Edits the descriptive fields while leaving the stored bytes untouched —
     * what a metadata edit means once a document really has content, since
     * re-pointing {@code storageKey} would orphan the blob.
     */
    public void updateMetadata(String title, String description, DocumentCategory category, UUID ownerKeycloakId) {
        this.title = Objects.requireNonNull(title, "title");
        this.description = description;
        this.category = Objects.requireNonNull(category, "category");
        this.ownerKeycloakId = ownerKeycloakId;
    }

    /**
     * A document whose bytes this service has just stored. The key is the one
     * the blob store generated and the size the count it actually wrote, so
     * neither is ever client-declared; only the filename is echoed from the
     * upload, and it is used for display, never as a path.
     */
    public static Document uploaded(String title, String description, DocumentCategory category,
                                    UUID ownerKeycloakId, String storageKey, String contentType,
                                    long sizeBytes, String originalFilename, String uploadedBy) {
        Document document = new Document(title, description, category, ownerKeycloakId,
                storageKey, contentType, sizeBytes, uploadedBy);
        document.originalFilename = originalFilename;
        return document;
    }

    /** Name to offer the browser on download; falls back to the title when nothing was uploaded here. */
    public String downloadFilename() {
        return originalFilename != null ? originalFilename : title;
    }

    /**
     * FR-41 access rule: the caller's role must satisfy the category's minimum
     * (so sensitive documents need HR/Admin), AND the caller must own the
     * document, or it is company-wide, or the caller is HR/Admin (who administer
     * and read everything).
     */
    public boolean isAccessibleBy(UUID callerKeycloakId, AccessRole callerRole) {
        boolean roleAllowed = callerRole.satisfies(category.getMinRole());
        boolean ownershipAllowed = ownerKeycloakId == null
                || ownerKeycloakId.equals(callerKeycloakId)
                || callerRole.isSensitiveTier();
        return roleAllowed && ownershipAllowed;
    }

    public boolean isSensitive() {
        return category.isSensitive();
    }

    /**
     * Offboarding (P3.3): revoke the departed employee's ownership so the document
     * passes into company/HR custody (min-role gate still applies to sensitive
     * categories). The metadata and its audit trail are preserved — nothing is
     * deleted. Returns whether ownership was actually revoked.
     */
    public boolean revokeOwnership() {
        if (ownerKeycloakId != null) {
            ownerKeycloakId = null;
            return true;
        }
        return false;
    }

    public UUID getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public DocumentCategory getCategory() {
        return category;
    }

    public UUID getOwnerKeycloakId() {
        return ownerKeycloakId;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public String getContentType() {
        return contentType;
    }

    public Long getSizeBytes() {
        return sizeBytes;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public String getUploadedBy() {
        return uploadedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
