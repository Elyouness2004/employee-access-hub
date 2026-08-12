package com.hub.documents.infrastructure;

import java.util.UUID;

import com.hub.documents.domain.DocumentCategory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentCategoryRepository extends JpaRepository<DocumentCategory, UUID> {

    /** Free-text catalogue search; the unfiltered page uses {@code findAll(Pageable)}. */
    Page<DocumentCategory> findAllByNameContainingIgnoreCaseOrDescriptionContainingIgnoreCase(
            String name, String description, Pageable pageable);

    boolean existsByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCaseAndIdNot(String name, UUID id);
}
