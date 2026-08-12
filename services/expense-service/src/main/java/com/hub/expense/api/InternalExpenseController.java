package com.hub.expense.api;

import com.hub.expense.api.dto.OffboardingRequest;
import com.hub.expense.api.dto.OffboardingResult;
import com.hub.expense.application.ExpenseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Service-to-service API, not routed by the gateway. hr-service calls this on
 * offboarding (P3.3) with the operator's token relayed — hence the HR/ADMIN
 * requirement, matching who may offboard in the first place.
 */
@RestController
@RequestMapping("/internal/expense")
@Tag(name = "Internal — service-to-service")
public class InternalExpenseController {

    private final ExpenseService expenseService;

    public InternalExpenseController(ExpenseService expenseService) {
        this.expenseService = expenseService;
    }

    @PostMapping("/offboarding")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "BR-05: cancel the offboarded employee's still-open claims (history stays immutable)")
    public OffboardingResult offboarding(@AuthenticationPrincipal Jwt jwt,
                                         Authentication authentication,
                                         @Valid @RequestBody OffboardingRequest request) {
        return expenseService.offboard(Actors.from(jwt, authentication), request.employeeKeycloakId());
    }
}
