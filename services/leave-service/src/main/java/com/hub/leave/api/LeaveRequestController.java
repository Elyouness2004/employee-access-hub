package com.hub.leave.api;

import java.net.URI;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

import com.hub.leave.api.dto.DecisionRequest;
import com.hub.leave.api.dto.LeaveRequestResponse;
import com.hub.leave.api.dto.PageResponse;
import com.hub.leave.api.dto.SubmitLeaveRequest;
import com.hub.leave.application.LeaveRequestFilter;
import com.hub.leave.application.LeaveRequestService;
import com.hub.leave.domain.LeaveStatus;
import com.hub.leave.domain.LeaveType;
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
 * manager, HR escalation — are layer 3 inside the application service, which
 * also pins the scope of each list so no paging or filter parameter can widen it.
 */
@RestController
@RequestMapping("/api/leave/requests")
@Tag(name = "Leave requests")
public class LeaveRequestController {

    /** Sortable columns; anything else falls back to the default to avoid a 500 on a bad sort. */
    private static final Set<String> SORTABLE =
            Set.of("createdAt", "status", "type", "businessDays", "decidedAt");
    private static final Sort NEWEST_FIRST = Sort.by(Sort.Direction.DESC, "createdAt");
    private static final Sort OLDEST_FIRST = Sort.by(Sort.Direction.ASC, "createdAt");
    private static final int MAX_PAGE_SIZE = 200;

    private final LeaveRequestService leaveRequestService;

    public LeaveRequestController(LeaveRequestService leaveRequestService) {
        this.leaveRequestService = leaveRequestService;
    }

    @PostMapping
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Submit a leave request for oneself "
            + "(422 on BR-01 balance or BR-03 overlap violation)")
    public ResponseEntity<LeaveRequestResponse> submit(@AuthenticationPrincipal Jwt jwt,
                                                       Authentication authentication,
                                                       @Valid @RequestBody SubmitLeaveRequest request) {
        LeaveRequestResponse created = leaveRequestService.submit(Actors.from(jwt, authentication), request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(created);
    }

    @GetMapping("/my")
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Own leave requests, newest first (paged, sorted, filtered, searchable)")
    public PageResponse<LeaveRequestResponse> myRequests(
            @AuthenticationPrincipal Jwt jwt, Authentication authentication,
            @RequestParam(required = false) LeaveStatus status,
            @RequestParam(required = false) LeaveType type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return leaveRequestService.myRequests(Actors.from(jwt, authentication),
                filter(status, type, from, to, search),
                Pageables.sanitize(pageable, SORTABLE, NEWEST_FIRST, MAX_PAGE_SIZE));
    }

    @GetMapping("/inbox")
    @PreAuthorize("hasRole('MANAGER')")
    @Operation(summary = "Manager approval inbox: pending requests of direct reports "
            + "(paged, sorted, filtered, searchable)")
    public PageResponse<LeaveRequestResponse> inbox(
            @AuthenticationPrincipal Jwt jwt, Authentication authentication,
            @RequestParam(required = false) LeaveType type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        return leaveRequestService.inbox(Actors.from(jwt, authentication),
                filter(null, type, from, to, search),
                Pageables.sanitize(pageable, SORTABLE, OLDEST_FIRST, MAX_PAGE_SIZE));
    }

    @GetMapping("/escalated")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "HR inbox: pending requests escalated per BR-02 "
            + "(paged, sorted, filtered, searchable)")
    public PageResponse<LeaveRequestResponse> escalated(
            @RequestParam(required = false) LeaveType type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        return leaveRequestService.escalated(filter(null, type, from, to, search),
                Pageables.sanitize(pageable, SORTABLE, OLDEST_FIRST, MAX_PAGE_SIZE));
    }

    private static LeaveRequestFilter filter(LeaveStatus status, LeaveType type,
                                             LocalDate from, LocalDate to, String search) {
        return LeaveRequestFilter.of(status, type, from, to, search);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "One request — visible to its owner, its manager, HR and Admin")
    public LeaveRequestResponse get(@AuthenticationPrincipal Jwt jwt,
                                    Authentication authentication,
                                    @PathVariable UUID id) {
        return leaveRequestService.get(Actors.from(jwt, authentication), id);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyRole('MANAGER', 'HR', 'ADMIN')")
    @Operation(summary = "Approve — direct manager only (or HR when escalated); "
            + "self-approval blocked (BR-02); debits the balance atomically")
    public LeaveRequestResponse approve(@AuthenticationPrincipal Jwt jwt,
                                        Authentication authentication,
                                        @PathVariable UUID id,
                                        @Valid @RequestBody(required = false) DecisionRequest decision) {
        return leaveRequestService.approve(Actors.from(jwt, authentication), id,
                decision == null ? null : decision.comment());
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAnyRole('MANAGER', 'HR', 'ADMIN')")
    @Operation(summary = "Reject — same authorization rules as approve")
    public LeaveRequestResponse reject(@AuthenticationPrincipal Jwt jwt,
                                       Authentication authentication,
                                       @PathVariable UUID id,
                                       @Valid @RequestBody(required = false) DecisionRequest decision) {
        return leaveRequestService.reject(Actors.from(jwt, authentication), id,
                decision == null ? null : decision.comment());
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Cancel one's own request while it is still pending (409 after a decision)")
    public LeaveRequestResponse cancel(@AuthenticationPrincipal Jwt jwt,
                                       Authentication authentication,
                                       @PathVariable UUID id) {
        return leaveRequestService.cancel(Actors.from(jwt, authentication), id);
    }
}
