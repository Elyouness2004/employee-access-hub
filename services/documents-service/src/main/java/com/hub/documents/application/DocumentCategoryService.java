package com.hub.documents.application;

import java.util.UUID;

import com.hub.documents.api.dto.CategoryRequest;
import com.hub.documents.api.dto.CategoryResponse;
import com.hub.documents.api.dto.PageResponse;
import com.hub.documents.domain.DocumentCategory;
import com.hub.documents.infrastructure.DocumentCategoryRepository;
import com.hub.documents.infrastructure.DocumentRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Admin management of document categories (the access-tier definitions). */
@Service
@Transactional
public class DocumentCategoryService {

    private final DocumentCategoryRepository categories;
    private final DocumentRepository documents;
    private final AuditTrail audit;

    public DocumentCategoryService(DocumentCategoryRepository categories,
                                   DocumentRepository documents,
                                   AuditTrail audit) {
        this.categories = categories;
        this.documents = documents;
        this.audit = audit;
    }

    /** Catalogue page; {@code search} matches the name or the description (blank = no filter). */
    @Transactional(readOnly = true)
    public PageResponse<CategoryResponse> page(String search, Pageable pageable) {
        String term = DocumentFilter.blankToNull(search);
        Page<DocumentCategory> page = term == null
                ? categories.findAll(pageable)
                : categories.findAllByNameContainingIgnoreCaseOrDescriptionContainingIgnoreCase(
                        term, term, pageable);
        return PageResponse.from(page, CategoryResponse::from);
    }

    @Transactional(readOnly = true)
    public CategoryResponse get(UUID id) {
        return CategoryResponse.from(require(id));
    }

    public CategoryResponse create(Actor actor, CategoryRequest request) {
        if (categories.existsByNameIgnoreCase(request.name())) {
            throw new DuplicateResourceException("category name already exists: " + request.name());
        }
        DocumentCategory category = new DocumentCategory(request.name(), request.description(), request.minRole());
        categories.save(category);
        audit.record(actor.username(), "DOCUMENT_CATEGORY_CREATED", "document_category:" + category.getId(),
                "name=" + request.name() + " minRole=" + request.minRole());
        return CategoryResponse.from(category);
    }

    public CategoryResponse update(Actor actor, UUID id, CategoryRequest request) {
        DocumentCategory category = require(id);
        if (categories.existsByNameIgnoreCaseAndIdNot(request.name(), id)) {
            throw new DuplicateResourceException("category name already exists: " + request.name());
        }
        category.rename(request.name(), request.description(), request.minRole());
        audit.record(actor.username(), "DOCUMENT_CATEGORY_UPDATED", "document_category:" + id,
                "name=" + request.name() + " minRole=" + request.minRole());
        return CategoryResponse.from(category);
    }

    public void delete(Actor actor, UUID id) {
        DocumentCategory category = require(id);
        if (documents.existsByCategory_Id(id)) {
            throw new ResourceInUseException("category still has documents: " + id);
        }
        categories.delete(category);
        audit.record(actor.username(), "DOCUMENT_CATEGORY_DELETED", "document_category:" + id, null);
    }

    private DocumentCategory require(UUID id) {
        return categories.findById(id).orElseThrow(() -> new ResourceNotFoundException("category", id));
    }
}
