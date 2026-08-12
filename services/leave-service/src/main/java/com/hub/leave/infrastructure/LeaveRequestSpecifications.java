package com.hub.leave.infrastructure;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.hub.leave.application.LeaveRequestFilter;
import com.hub.leave.domain.LeaveRequest;
import com.hub.leave.domain.LeaveStatus;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

/**
 * Builds the dynamic {@link Specification} behind the leave request lists.
 * The {@code ownedBy}/{@code addressedTo}/{@code escalated} scopes are the
 * layer-3 rule expressed in SQL — they are ANDed with the user's filters by the
 * application service and are never derived from request parameters.
 */
public final class LeaveRequestSpecifications {

    private LeaveRequestSpecifications() {
    }

    /** The caller's own requests. */
    public static Specification<LeaveRequest> ownedBy(UUID employeeKeycloakId) {
        return (root, query, cb) -> cb.equal(root.get("employeeKeycloakId"), employeeKeycloakId);
    }

    /** Pending requests addressed to this manager (the snapshot taken at submit time). */
    public static Specification<LeaveRequest> addressedTo(UUID managerKeycloakId) {
        return (root, query, cb) -> cb.and(
                cb.equal(root.get("managerKeycloakId"), managerKeycloakId),
                cb.equal(root.get("status"), LeaveStatus.SUBMITTED));
    }

    /** Pending requests escalated to HR per BR-02. */
    public static Specification<LeaveRequest> escalated() {
        return (root, query, cb) -> cb.and(
                cb.isTrue(root.get("hrEscalated")),
                cb.equal(root.get("status"), LeaveStatus.SUBMITTED));
    }

    public static Specification<LeaveRequest> matching(LeaveRequestFilter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (filter.status() != null) {
                predicates.add(cb.equal(root.get("status"), filter.status()));
            }
            if (filter.type() != null) {
                predicates.add(cb.equal(root.get("type"), filter.type()));
            }
            if (filter.from() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("period").get("end"), filter.from()));
            }
            if (filter.to() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("period").get("start"), filter.to()));
            }
            if (filter.search() != null) {
                String term = "%" + filter.search().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("reason")), term),
                        cb.like(cb.lower(root.get("decisionComment")), term)));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }
}
