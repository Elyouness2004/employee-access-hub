package com.hub.leave.api;

import com.hub.leave.api.dto.OffboardingRequest;
import com.hub.leave.api.dto.OffboardingResult;
import com.hub.leave.application.LeaveRequestService;
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
@RequestMapping("/internal/leave")
@Tag(name = "Internal — service-to-service")
public class InternalLeaveController {

    private final LeaveRequestService leaveRequestService;

    public InternalLeaveController(LeaveRequestService leaveRequestService) {
        this.leaveRequestService = leaveRequestService;
    }

    @PostMapping("/offboarding")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "BR-05: cancel the offboarded employee's pending requests and "
            + "not-yet-started approved leave (with balance re-credit)")
    public OffboardingResult offboarding(@AuthenticationPrincipal Jwt jwt,
                                         Authentication authentication,
                                         @Valid @RequestBody OffboardingRequest request) {
        return leaveRequestService.offboard(Actors.from(jwt, authentication), request.employeeKeycloakId());
    }
}
