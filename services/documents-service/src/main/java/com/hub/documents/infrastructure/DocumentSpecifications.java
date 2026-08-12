package com.hub.documents.infrastructure;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import com.hub.documents.application.DocumentFilter;
import com.hub.documents.domain.AccessRole;
import com.hub.documents.domain.Document;
import com.hub.documents.domain.DocumentCategory;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

/**
 * The document list as SQL: the FR-41 access rule plus the user's filters,
 * evaluated by the database so a page really is a page.
 *
 * <p>{@link #accessibleBy} is the query projection of the domain rule
 * {@code Document.isAccessibleBy} — the domain remains the single authority on
 * whether one document may be read (it still guards every single-document
 * operation), and {@code DocumentAccessSpecificationTest} pins the two to the
 * same answer for every role/ownership combination. Doing this in SQL rather
 * than filtering after the fetch is what makes paging correct: filtering a page
 * in memory would return short (or empty) pages with a total count that lies.
 */
public final class DocumentSpecifications {

    private DocumentSpecifications() {
    }

    /** Category role gate AND ownership, exactly as {@code Document.isAccessibleBy} states it. */
    public static Specification<Document> accessibleBy(UUID callerKeycloakId, AccessRole callerRole) {
        return (root, query, cb) -> {
            Join<Document, DocumentCategory> category = root.join("category");
            List<AccessRole> reachableTiers = Arrays.stream(AccessRole.values())
                    .filter(callerRole::satisfies)
                    .toList();
            Predicate roleGate = category.get("minRole").in(reachableTiers);
            if (callerRole.isSensitiveTier()) {
                // HR/Admin administer and read everything within their tier
                return roleGate;
            }
            return cb.and(roleGate, cb.or(
                    cb.isNull(root.get("ownerKeycloakId")),
                    cb.equal(root.get("ownerKeycloakId"), callerKeycloakId)));
        };
    }

    public static Specification<Document> matching(DocumentFilter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (filter.categoryId() != null) {
                predicates.add(cb.equal(root.get("category").get("id"), filter.categoryId()));
            }
            if (filter.ownerKeycloakId() != null) {
                predicates.add(cb.equal(root.get("ownerKeycloakId"), filter.ownerKeycloakId()));
            }
            if (filter.search() != null) {
                String term = contains(filter.search());
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), term),
                        cb.like(cb.lower(root.get("description")), term),
                        cb.like(cb.lower(root.get("originalFilename")), term)));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static String contains(String value) {
        return "%" + value.toLowerCase() + "%";
    }
}
