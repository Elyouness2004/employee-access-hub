package com.hub.hr.infrastructure;

import java.util.ArrayList;
import java.util.List;

import com.hub.hr.application.AuditFilter;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

/**
 * Builds the dynamic {@link Specification} backing the Audit Center list/export
 * from an {@link AuditFilter}. Only predicates for present fields are added, so a
 * combination of filters ANDs cleanly and an empty filter matches everything.
 * The result predicate follows the codebase convention that failure actions end
 * with {@code _FAILED}. Mirrors the infra→application direction already used by
 * {@code JpaAuditTrail}.
 */
public final class AuditLogSpecifications {

    private static final String FAILED_SUFFIX = "%FAILED";

    private AuditLogSpecifications() {
    }

    public static Specification<AuditLogEntry> matching(AuditFilter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (filter.from() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("occurredAt"), filter.from()));
            }
            if (filter.to() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("occurredAt"), filter.to()));
            }
            if (filter.actor() != null) {
                predicates.add(cb.like(cb.lower(root.get("actor")), contains(filter.actor())));
            }
            if (filter.action() != null) {
                predicates.add(cb.equal(root.get("action"), filter.action()));
            }
            if (filter.resource() != null) {
                predicates.add(cb.like(cb.lower(root.get("resource")), contains(filter.resource())));
            }
            if (filter.result() == AuditFilter.Result.FAILURE) {
                predicates.add(cb.like(root.get("action"), FAILED_SUFFIX));
            } else if (filter.result() == AuditFilter.Result.SUCCESS) {
                predicates.add(cb.notLike(root.get("action"), FAILED_SUFFIX));
            }
            if (filter.search() != null) {
                String term = contains(filter.search());
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("actor")), term),
                        cb.like(cb.lower(root.get("action")), term),
                        cb.like(cb.lower(root.get("resource")), term),
                        cb.like(cb.lower(root.get("details")), term)));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static String contains(String value) {
        return "%" + value.toLowerCase() + "%";
    }
}
