package com.hub.documents.infrastructure;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import com.hub.documents.domain.AccessRole;
import com.hub.documents.domain.Document;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * {@link JpaSpecificationExecutor} backs the paged/filtered/searchable list
 * through {@link DocumentSpecifications}, which also evaluates the FR-41 access
 * rule in SQL.
 */
public interface DocumentRepository extends JpaRepository<Document, UUID>, JpaSpecificationExecutor<Document> {

    List<Document> findAllByOwnerKeycloakId(UUID ownerKeycloakId);

    boolean existsByCategory_Id(UUID categoryId);

    long countByCategory_MinRoleIn(Collection<AccessRole> minRoles);
}
