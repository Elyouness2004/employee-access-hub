package com.hub.leave.api;

import java.time.LocalDate;
import java.util.UUID;

import com.hub.leave.api.dto.BalanceAdjustmentRequest;
import com.hub.leave.api.dto.LeaveBalanceResponse;
import com.hub.leave.application.LeaveBalanceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/leave/balances")
@Tag(name = "Leave balances")
public class LeaveBalanceController {

    private final LeaveBalanceService leaveBalanceService;

    public LeaveBalanceController(LeaveBalanceService leaveBalanceService) {
        this.leaveBalanceService = leaveBalanceService;
    }

    @GetMapping("/my")
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Own balance for the given (default: current) year; "
            + "provisions the default allocation on first use")
    public LeaveBalanceResponse myBalance(@AuthenticationPrincipal Jwt jwt,
                                          Authentication authentication,
                                          @RequestParam(required = false) Integer year) {
        return leaveBalanceService.myBalance(Actors.from(jwt, authentication), resolve(year));
    }

    @GetMapping("/{employeeId}")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "Balance of any employee (by HR employee id)")
    public LeaveBalanceResponse byEmployee(@PathVariable UUID employeeId,
                                           @RequestParam(required = false) Integer year) {
        return leaveBalanceService.byEmployeeId(employeeId, resolve(year));
    }

    @PutMapping("/{employeeId}")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "Adjust an employee's annual allocation (FR-22, audit-logged; "
            + "422 below days already used)")
    public LeaveBalanceResponse adjust(@AuthenticationPrincipal Jwt jwt,
                                       Authentication authentication,
                                       @PathVariable UUID employeeId,
                                       @RequestParam(required = false) Integer year,
                                       @Valid @RequestBody BalanceAdjustmentRequest request) {
        return leaveBalanceService.adjust(Actors.from(jwt, authentication), employeeId, resolve(year), request);
    }

    private static int resolve(Integer year) {
        return year != null ? year : LocalDate.now().getYear();
    }
}
