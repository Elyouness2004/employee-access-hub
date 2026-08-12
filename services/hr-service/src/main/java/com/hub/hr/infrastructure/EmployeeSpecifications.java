package com.hub.hr.infrastructure;

import java.util.ArrayList;
import java.util.List;

import com.hub.hr.application.EmployeeFilter;
import com.hub.hr.domain.Employee;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

/**
 * Builds the dynamic {@link Specification} backing the employee directory and
 * the manager team view from an {@link EmployeeFilter}. Only predicates for
 * present fields are added, so a combination of filters ANDs cleanly and an
 * empty filter matches everything. Mirrors {@link AuditLogSpecifications}.
 */
public final class EmployeeSpecifications {

    private EmployeeSpecifications() {
    }

    public static Specification<Employee> matching(EmployeeFilter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (filter.status() != null) {
                predicates.add(cb.equal(root.get("status"), filter.status()));
            }
            if (filter.provisioningStatus() != null) {
                predicates.add(cb.equal(root.get("provisioningStatus"), filter.provisioningStatus()));
            }
            if (filter.departmentId() != null) {
                predicates.add(cb.equal(root.get("departmentId"), filter.departmentId()));
            }
            if (filter.positionId() != null) {
                predicates.add(cb.equal(root.get("positionId"), filter.positionId()));
            }
            if (filter.managerId() != null) {
                predicates.add(cb.equal(root.get("managerId"), filter.managerId()));
            }
            if (filter.search() != null) {
                String term = contains(filter.search());
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("matricule")), term),
                        cb.like(cb.lower(root.get("firstName")), term),
                        cb.like(cb.lower(root.get("lastName")), term),
                        cb.like(cb.lower(root.get("email")), term)));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static String contains(String value) {
        return "%" + value.toLowerCase() + "%";
    }
}
