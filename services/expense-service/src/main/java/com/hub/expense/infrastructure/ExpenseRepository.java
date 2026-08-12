package com.hub.expense.infrastructure;

import java.util.List;
import java.util.UUID;

import com.hub.expense.domain.Expense;
import com.hub.expense.domain.ExpenseStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * {@link JpaSpecificationExecutor} backs the paged/filtered/searchable lists
 * through {@link ExpenseSpecifications} — it replaces the hand-written search
 * query, so status, category, date range, amount range and free text all compose
 * through one mechanism. The derived queries below serve the fixed-scope reads
 * (statistics, BR-05 offboarding) that need the whole set rather than a page.
 */
public interface ExpenseRepository extends JpaRepository<Expense, UUID>, JpaSpecificationExecutor<Expense> {

    List<Expense> findAllByEmployeeKeycloakIdOrderByCreatedAtDesc(UUID employeeKeycloakId);

    List<Expense> findAllByStatusOrderByCreatedAtAsc(ExpenseStatus status);

    long countByStatus(ExpenseStatus status);
}
