package com.hub.expense.infrastructure;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.hub.expense.application.ExpenseFilter;
import com.hub.expense.domain.Expense;
import com.hub.expense.domain.ExpenseStatus;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

/**
 * Builds the dynamic {@link Specification} behind the expense lists. The
 * {@code ownedBy}/{@code addressedTo}/{@code escalated}/{@code inStatus} scopes
 * are the layer-3 rule expressed in SQL — they are ANDed with the user's filters
 * by the application service and are never derived from request parameters.
 */
public final class ExpenseSpecifications {

    private ExpenseSpecifications() {
    }

    /** The caller's own claims. */
    public static Specification<Expense> ownedBy(UUID employeeKeycloakId) {
        return (root, query, cb) -> cb.equal(root.get("employeeKeycloakId"), employeeKeycloakId);
    }

    /** Pending first-level claims addressed to this manager. */
    public static Specification<Expense> addressedTo(UUID managerKeycloakId) {
        return (root, query, cb) -> cb.and(
                cb.equal(root.get("managerKeycloakId"), managerKeycloakId),
                cb.equal(root.get("status"), ExpenseStatus.SUBMITTED));
    }

    /** Pending first-level claims escalated to HR per BR-02. */
    public static Specification<Expense> escalated() {
        return (root, query, cb) -> cb.and(
                cb.isTrue(root.get("hrEscalated")),
                cb.equal(root.get("status"), ExpenseStatus.SUBMITTED));
    }

    /** A fixed status scope — the BR-03 second-approval queue. */
    public static Specification<Expense> inStatus(ExpenseStatus status) {
        return (root, query, cb) -> cb.equal(root.get("status"), status);
    }

    /** No scope: the HR/Admin search spans every claim. */
    public static Specification<Expense> all() {
        return (root, query, cb) -> cb.conjunction();
    }

    public static Specification<Expense> matching(ExpenseFilter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (filter.status() != null) {
                predicates.add(cb.equal(root.get("status"), filter.status()));
            }
            if (filter.category() != null) {
                predicates.add(cb.equal(root.get("category"), filter.category()));
            }
            if (filter.from() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("expenseDate"), filter.from()));
            }
            if (filter.to() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("expenseDate"), filter.to()));
            }
            if (filter.minAmount() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("amount").get("amount"), filter.minAmount()));
            }
            if (filter.maxAmount() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("amount").get("amount"), filter.maxAmount()));
            }
            if (filter.search() != null) {
                String term = "%" + filter.search().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("description")), term),
                        cb.like(cb.lower(root.get("decisionComment")), term)));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }
}
