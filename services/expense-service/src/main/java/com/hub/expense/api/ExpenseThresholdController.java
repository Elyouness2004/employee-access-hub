package com.hub.expense.api;

import com.hub.expense.api.dto.ThresholdRequest;
import com.hub.expense.api.dto.ThresholdResponse;
import com.hub.expense.application.ExpenseThresholdService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Configure the BR-03 second-level approval threshold — HR/Admin only. */
@RestController
@RequestMapping("/api/expenses/threshold")
@PreAuthorize("hasAnyRole('HR', 'ADMIN')")
@Tag(name = "Expense approval threshold")
public class ExpenseThresholdController {

    private final ExpenseThresholdService thresholdService;

    public ExpenseThresholdController(ExpenseThresholdService thresholdService) {
        this.thresholdService = thresholdService;
    }

    @GetMapping
    @Operation(summary = "Current second-level approval threshold (BR-03)")
    public ThresholdResponse get() {
        return thresholdService.get();
    }

    @PutMapping
    @Operation(summary = "Set the second-level approval threshold (audited)")
    public ThresholdResponse update(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
                                    @Valid @RequestBody ThresholdRequest request) {
        return thresholdService.update(Actors.from(jwt, authentication), request);
    }
}
