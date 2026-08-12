package com.hub.hr.api;

import java.util.Set;
import java.util.UUID;

import com.hub.hr.api.dto.EmployeeProfileResponse;
import com.hub.hr.api.dto.PageResponse;
import com.hub.hr.application.EmployeeFilter;
import com.hub.hr.application.EmployeeService;
import com.hub.hr.domain.EmployeeStatus;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Self-service window onto the HR record (P2.4 / P2.5), the counterpart of the
 * HR/Admin-only {@link EmployeeController}. Coarse RBAC here (layer 2); the
 * scope itself is layer 3 in the application service, resolved from the caller's
 * own {@code jwt.sub}: {@code GET /api/hr/me} can only ever return the caller's
 * record and {@code GET /api/hr/me/team} only the reports whose manager is the
 * caller. No path or query parameter can widen either, so there is no id to
 * tamper with — the same shape as {@link SessionController} and
 * {@link NotificationController}.
 */
@RestController
@RequestMapping("/api/hr/me")
@Tag(name = "Me")
public class MeController {

    /** Sortable columns for the team view; anything else falls back to the default sort. */
    private static final Set<String> SORTABLE =
            Set.of("matricule", "firstName", "lastName", "email", "hireDate", "status", "createdAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.ASC, "matricule");
    private static final int MAX_PAGE_SIZE = 100;

    private final EmployeeService employeeService;

    public MeController(EmployeeService employeeService) {
        this.employeeService = employeeService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "My own HR profile — department, position and manager resolved "
            + "(404 while identity onboarding has not linked an employee record)")
    public EmployeeProfileResponse profile(@AuthenticationPrincipal Jwt jwt, Authentication authentication) {
        return employeeService.myProfile(callerKeycloakId(jwt, authentication));
    }

    @GetMapping("/team")
    @PreAuthorize("hasRole('MANAGER')")
    @Operation(summary = "My direct reports (paged, sorted, filtered, searchable); "
            + "404 while identity onboarding has not linked an employee record")
    public PageResponse<EmployeeProfileResponse> team(
            @AuthenticationPrincipal Jwt jwt, Authentication authentication,
            @RequestParam(required = false) EmployeeStatus status,
            @RequestParam(required = false) UUID departmentId,
            @RequestParam(required = false) UUID positionId,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "matricule") Pageable pageable) {
        return employeeService.team(callerKeycloakId(jwt, authentication),
                EmployeeFilter.of(status, null, departmentId, positionId, null, search),
                Pageables.sanitize(pageable, SORTABLE, DEFAULT_SORT, MAX_PAGE_SIZE));
    }

    private static UUID callerKeycloakId(Jwt jwt, Authentication authentication) {
        return Actors.from(jwt, authentication).keycloakId();
    }
}
