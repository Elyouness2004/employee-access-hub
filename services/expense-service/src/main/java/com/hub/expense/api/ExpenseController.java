package com.hub.expense.api;

import java.math.BigDecimal;
import java.net.URI;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

import com.hub.expense.api.dto.CreateExpenseRequest;
import com.hub.expense.api.dto.DecisionRequest;
import com.hub.expense.api.dto.ExpenseResponse;
import com.hub.expense.api.dto.PageResponse;
import com.hub.expense.application.ExpenseFilter;
import com.hub.expense.application.ExpenseService;
import com.hub.expense.domain.ExpenseCategory;
import com.hub.expense.domain.ExpenseStatus;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * Coarse RBAC here (@PreAuthorize, layer 2); ownership rules — owner, direct
 * manager, HR escalation, second-level sign-off — are layer 3 inside the
 * application service, which also pins the scope of each list so no paging or
 * filter parameter can widen it.
 */
@RestController
@RequestMapping("/api/expenses")
@Tag(name = "Expenses")
public class ExpenseController {

    /** Sortable columns; anything else falls back to the default to avoid a 500 on a bad sort. */
    private static final Set<String> SORTABLE =
            Set.of("createdAt", "expenseDate", "status", "category", "decidedAt");
    private static final Sort NEWEST_FIRST = Sort.by(Sort.Direction.DESC, "createdAt");
    private static final Sort OLDEST_FIRST = Sort.by(Sort.Direction.ASC, "createdAt");
    private static final int MAX_PAGE_SIZE = 200;

    private final ExpenseService expenseService;

    public ExpenseController(ExpenseService expenseService) {
        this.expenseService = expenseService;
    }

    // ---- Employee -------------------------------------------------------

    @PostMapping
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Create an expense claim for oneself")
    public ResponseEntity<ExpenseResponse> create(@AuthenticationPrincipal Jwt jwt,
                                                   Authentication authentication,
                                                   @Valid @RequestBody CreateExpenseRequest request) {
        ExpenseResponse created = expenseService.create(Actors.from(jwt, authentication), request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(created);
    }

    @GetMapping("/my")
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Own expense claims, newest first (paged, sorted, filtered, searchable)")
    public PageResponse<ExpenseResponse> myExpenses(
            @AuthenticationPrincipal Jwt jwt, Authentication authentication,
            @RequestParam(required = false) ExpenseStatus status,
            @RequestParam(required = false) ExpenseCategory category,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return expenseService.myExpenses(Actors.from(jwt, authentication),
                ExpenseFilter.of(status, category, from, to, minAmount, maxAmount, search),
                Pageables.sanitize(pageable, SORTABLE, NEWEST_FIRST, MAX_PAGE_SIZE));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "One claim — visible to its owner, its manager, HR and Admin (BR-01)")
    public ExpenseResponse get(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
                               @PathVariable UUID id) {
        return expenseService.get(Actors.from(jwt, authentication), id);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Cancel one's own claim while it is still pending (409 after a decision)")
    public ExpenseResponse cancel(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
                                  @PathVariable UUID id) {
        return expenseService.cancel(Actors.from(jwt, authentication), id);
    }

    // ---- Manager --------------------------------------------------------

    @GetMapping("/pending")
    @PreAuthorize("hasRole('MANAGER')")
    @Operation(summary = "Manager approval inbox: pending first-level claims of direct reports "
            + "(paged, sorted, filtered, searchable)")
    public PageResponse<ExpenseResponse> pending(
            @AuthenticationPrincipal Jwt jwt, Authentication authentication,
            @RequestParam(required = false) ExpenseCategory category,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        return expenseService.pending(Actors.from(jwt, authentication),
                ExpenseFilter.of(null, category, from, to, minAmount, maxAmount, search),
                Pageables.sanitize(pageable, SORTABLE, OLDEST_FIRST, MAX_PAGE_SIZE));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyRole('MANAGER', 'HR', 'ADMIN')")
    @Operation(summary = "Approve — first level by the direct manager (or HR when escalated); "
            + "above the threshold this routes to a second-level HR/Admin approval (BR-03)")
    public ExpenseResponse approve(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
                                   @PathVariable UUID id,
                                   @Valid @RequestBody(required = false) DecisionRequest decision) {
        return expenseService.approve(Actors.from(jwt, authentication), id,
                decision == null ? null : decision.comment());
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAnyRole('MANAGER', 'HR', 'ADMIN')")
    @Operation(summary = "Reject — same authorization rules as approve; REJECTED is terminal (BR-04)")
    public ExpenseResponse reject(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
                                  @PathVariable UUID id,
                                  @Valid @RequestBody(required = false) DecisionRequest decision) {
        return expenseService.reject(Actors.from(jwt, authentication), id,
                decision == null ? null : decision.comment());
    }

    // ---- HR / Admin -----------------------------------------------------

    @GetMapping("/escalated")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "HR inbox: pending first-level claims escalated per BR-02 "
            + "(paged, sorted, filtered, searchable)")
    public PageResponse<ExpenseResponse> escalated(
            @RequestParam(required = false) ExpenseCategory category,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        return expenseService.escalated(
                ExpenseFilter.of(null, category, from, to, minAmount, maxAmount, search),
                Pageables.sanitize(pageable, SORTABLE, OLDEST_FIRST, MAX_PAGE_SIZE));
    }

    @GetMapping("/second-approval")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "HR/Admin queue: above-threshold claims awaiting second-level sign-off (BR-03) "
            + "(paged, sorted, filtered, searchable)")
    public PageResponse<ExpenseResponse> secondApprovalQueue(
            @RequestParam(required = false) ExpenseCategory category,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        return expenseService.secondApprovalQueue(
                ExpenseFilter.of(null, category, from, to, minAmount, maxAmount, search),
                Pageables.sanitize(pageable, SORTABLE, OLDEST_FIRST, MAX_PAGE_SIZE));
    }

    @GetMapping("/search")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "Search all claims (paged, sorted; status, category, date range, "
            + "amount range and free-text filters)")
    public PageResponse<ExpenseResponse> search(
            @RequestParam(required = false) ExpenseStatus status,
            @RequestParam(required = false) ExpenseCategory category,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return expenseService.search(
                ExpenseFilter.of(status, category, from, to, minAmount, maxAmount, search),
                Pageables.sanitize(pageable, SORTABLE, NEWEST_FIRST, MAX_PAGE_SIZE));
    }
}
