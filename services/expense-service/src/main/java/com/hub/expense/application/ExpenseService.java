package com.hub.expense.application;

import java.math.BigDecimal;
import java.util.UUID;

import com.hub.expense.api.dto.CreateExpenseRequest;
import com.hub.expense.api.dto.ExpenseResponse;
import com.hub.expense.api.dto.ExpenseStatsResponse;
import com.hub.expense.api.dto.OffboardingResult;
import com.hub.expense.api.dto.PageResponse;
import com.hub.expense.domain.EmployeeDirectory;
import com.hub.expense.domain.EmployeeSnapshot;
import com.hub.expense.domain.Expense;
import com.hub.expense.domain.ExpenseStatus;
import com.hub.expense.domain.IllegalExpenseStateException;
import com.hub.expense.domain.Money;
import com.hub.expense.infrastructure.ExpenseRepository;
import com.hub.expense.infrastructure.ExpenseSpecifications;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Expense lifecycle use cases. Layer-3 authorization (ownership rules RBAC
 * cannot express, §2.7) is enforced here with AccessDeniedException → 403; the
 * BR-xx invariants themselves live in the domain. Every approval or rejection
 * writes an audit entry in the same transaction (BR-05).
 */
@Service
@Transactional
public class ExpenseService {

    private final ExpenseRepository expenses;
    private final EmployeeDirectory directory;
    private final ExpenseThresholdService thresholds;
    private final AuditTrail audit;

    public ExpenseService(ExpenseRepository expenses,
                          EmployeeDirectory directory,
                          ExpenseThresholdService thresholds,
                          AuditTrail audit) {
        this.expenses = expenses;
        this.directory = directory;
        this.thresholds = thresholds;
        this.audit = audit;
    }

    /** Create a claim for oneself. Currency defaults to the deployment currency. */
    public ExpenseResponse create(Actor actor, CreateExpenseRequest dto) {
        EmployeeSnapshot employee = directory.findByKeycloakId(actor.keycloakId())
                .orElseThrow(() -> new EmployeeNotEligibleException(
                        "no employee record is linked to identity " + actor.keycloakId()
                                + "; identity onboarding must run first"));
        if (!employee.active()) {
            throw new EmployeeNotEligibleException("employee is not active");
        }

        String currency = dto.currency() != null ? dto.currency()
                : thresholds.currentThreshold().currency();
        Money amount = Money.of(dto.amount(), currency);
        Expense expense = Expense.submit(employee.id(), actor.keycloakId(), employee.managerKeycloakId(),
                dto.category(), amount, dto.expenseDate(), dto.description());

        expenses.save(expense);
        audit.record(actor.username(), "EXPENSE_SUBMITTED", "expense:" + expense.getId(),
                "category=" + dto.category() + " amount=" + amount.amount() + " " + amount.currency()
                        + (expense.isHrEscalated() ? " escalated=HR" : ""));
        return ExpenseResponse.from(expense);
    }

    @Transactional(readOnly = true)
    public PageResponse<ExpenseResponse> myExpenses(Actor actor, ExpenseFilter filter, Pageable pageable) {
        return page(ExpenseSpecifications.ownedBy(actor.keycloakId()), filter, pageable);
    }

    /** BR-01: visible to its owner, its direct manager, and HR/Admin. */
    @Transactional(readOnly = true)
    public ExpenseResponse get(Actor actor, UUID id) {
        Expense expense = require(id);
        boolean owner = expense.getEmployeeKeycloakId().equals(actor.keycloakId());
        boolean manager = actor.keycloakId().equals(expense.getManagerKeycloakId());
        if (!owner && !manager && !actor.hrOrAdmin()) {
            throw new AccessDeniedException("not allowed to view this expense");
        }
        return ExpenseResponse.from(expense);
    }

    /** Owner-only cancellation, before any decision. */
    public ExpenseResponse cancel(Actor actor, UUID id) {
        Expense expense = require(id);
        if (!expense.getEmployeeKeycloakId().equals(actor.keycloakId())) {
            throw new AccessDeniedException("only the owner may cancel an expense");
        }
        expense.cancel();
        audit.record(actor.username(), "EXPENSE_CANCELLED", "expense:" + expense.getId(), null);
        return ExpenseResponse.from(expense);
    }

    /** Manager pending inbox: first-level claims of direct reports. */
    @Transactional(readOnly = true)
    public PageResponse<ExpenseResponse> pending(Actor actor, ExpenseFilter filter, Pageable pageable) {
        return page(ExpenseSpecifications.addressedTo(actor.keycloakId()), filter, pageable);
    }

    /** HR first-level inbox for BR-02 escalations. */
    @Transactional(readOnly = true)
    public PageResponse<ExpenseResponse> escalated(ExpenseFilter filter, Pageable pageable) {
        return page(ExpenseSpecifications.escalated(), filter, pageable);
    }

    /** HR second-level queue (BR-03): above-threshold claims awaiting sign-off. */
    @Transactional(readOnly = true)
    public PageResponse<ExpenseResponse> secondApprovalQueue(ExpenseFilter filter, Pageable pageable) {
        return page(ExpenseSpecifications.inStatus(ExpenseStatus.PENDING_SECOND_APPROVAL), filter, pageable);
    }

    /** HR/Admin search across every claim. */
    @Transactional(readOnly = true)
    public PageResponse<ExpenseResponse> search(ExpenseFilter filter, Pageable pageable) {
        return page(ExpenseSpecifications.all(), filter, pageable);
    }

    /** One scope (layer 3) AND the caller's filters, paged by the database. */
    private PageResponse<ExpenseResponse> page(Specification<Expense> scope,
                                               ExpenseFilter filter, Pageable pageable) {
        return PageResponse.from(
                expenses.findAll(scope.and(ExpenseSpecifications.matching(filter)), pageable),
                ExpenseResponse::from);
    }

    /** Aggregate KPIs for the analytics context (P6.2) — counts and approved spend. */
    @Transactional(readOnly = true)
    public ExpenseStatsResponse stats() {
        long submitted = expenses.countByStatus(ExpenseStatus.SUBMITTED);
        long pending = expenses.countByStatus(ExpenseStatus.PENDING_SECOND_APPROVAL);
        long approved = expenses.countByStatus(ExpenseStatus.APPROVED);
        long rejected = expenses.countByStatus(ExpenseStatus.REJECTED);
        long cancelled = expenses.countByStatus(ExpenseStatus.CANCELLED);
        BigDecimal approvedAmount = expenses.findAllByStatusOrderByCreatedAtAsc(ExpenseStatus.APPROVED).stream()
                .map(expense -> expense.getAmount().amount())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new ExpenseStatsResponse(submitted, pending, approved, rejected, cancelled,
                submitted + pending + approved + rejected + cancelled,
                approvedAmount, thresholds.currentThreshold().currency());
    }

    /**
     * Approve. From SUBMITTED it is a first-level decision (direct manager, or
     * HR when escalated) that either finishes or routes to a second level per
     * BR-03; from PENDING_SECOND_APPROVAL it is the HR/Admin second-level
     * sign-off. Any other state is a 409 (BR-04 for REJECTED).
     */
    public ExpenseResponse approve(Actor actor, UUID id, String comment) {
        Expense expense = require(id);
        switch (expense.getStatus()) {
            case SUBMITTED -> {
                authorizeFirstLevel(actor, expense);
                expense.firstApproval(actor.keycloakId(), comment, thresholds.currentThreshold());
                if (expense.getStatus() == ExpenseStatus.PENDING_SECOND_APPROVAL) {
                    audit.record(actor.username(), "EXPENSE_FIRST_APPROVED", "expense:" + expense.getId(),
                            "amount=" + expense.getAmount().amount() + " " + expense.getAmount().currency()
                                    + " routed to second-level approval (BR-03)");
                } else {
                    audit.record(actor.username(), "EXPENSE_APPROVED", "expense:" + expense.getId(),
                            "amount=" + expense.getAmount().amount() + " " + expense.getAmount().currency());
                }
            }
            case PENDING_SECOND_APPROVAL -> {
                authorizeSecondLevel(actor);
                expense.secondApproval(actor.keycloakId(), comment);
                audit.record(actor.username(), "EXPENSE_APPROVED", "expense:" + expense.getId(),
                        "second-level amount=" + expense.getAmount().amount() + " "
                                + expense.getAmount().currency());
            }
            default -> throw new IllegalExpenseStateException(expense.getStatus(), "approve");
        }
        return ExpenseResponse.from(expense);
    }

    public ExpenseResponse reject(Actor actor, UUID id, String comment) {
        Expense expense = require(id);
        switch (expense.getStatus()) {
            case SUBMITTED -> authorizeFirstLevel(actor, expense);
            case PENDING_SECOND_APPROVAL -> authorizeSecondLevel(actor);
            default -> throw new IllegalExpenseStateException(expense.getStatus(), "reject");
        }
        expense.reject(actor.keycloakId(), comment);
        audit.record(actor.username(), "EXPENSE_REJECTED", "expense:" + expense.getId(), null);
        return ExpenseResponse.from(expense);
    }

    /**
     * BR-05 offboarding consumer (P3.3): when hr-service offboards an employee,
     * cancel their still-open claims (SUBMITTED / awaiting second approval).
     * Decided claims stay immutable. New submissions are already blocked because
     * the HR directory now reports the employee inactive (see {@link #create}).
     */
    public OffboardingResult offboard(Actor actor, UUID employeeKeycloakId) {
        int cancelled = 0;
        for (Expense expense : expenses.findAllByEmployeeKeycloakIdOrderByCreatedAtDesc(employeeKeycloakId)) {
            if (expense.cancelForOffboarding()) {
                cancelled++;
            }
        }
        audit.record(actor.username(), "EXPENSE_OFFBOARDING_CANCELLATION", "employee:" + employeeKeycloakId,
                "cancelledClaims=" + cancelled);
        return new OffboardingResult(cancelled);
    }

    private Expense require(UUID id) {
        return expenses.findById(id).orElseThrow(() -> new ResourceNotFoundException("expense", id));
    }

    /** BR-02: direct manager decides; HR/Admin decides only escalated claims. */
    private void authorizeFirstLevel(Actor actor, Expense expense) {
        if (expense.isHrEscalated()) {
            if (!actor.hrOrAdmin()) {
                throw new AccessDeniedException("this expense is escalated to HR");
            }
        } else if (!actor.keycloakId().equals(expense.getManagerKeycloakId())) {
            throw new AccessDeniedException("only the direct manager may decide this expense");
        }
    }

    /** BR-03: second-level sign-off is reserved to HR/Admin. */
    private void authorizeSecondLevel(Actor actor) {
        if (!actor.hrOrAdmin()) {
            throw new AccessDeniedException("second-level approval requires HR or Admin");
        }
    }
}
