package com.hub.hr.api;

import java.util.List;

import com.hub.hr.api.dto.IdentityLinkResponse;
import com.hub.hr.application.IdentityQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Service-to-service identity-link directory (Part 5): employee↔Keycloak links
 * for provisioned users. Internal-only, HR/Admin token required.
 */
@RestController
@RequestMapping("/internal/users")
@PreAuthorize("hasAnyRole('HR', 'ADMIN')")
@Tag(name = "Internal — service-to-service")
public class InternalUsersController {

    private final IdentityQueryService queries;

    public InternalUsersController(IdentityQueryService queries) {
        this.queries = queries;
    }

    @GetMapping
    @Operation(summary = "Identity links for all provisioned employees")
    public List<IdentityLinkResponse> users() {
        return queries.identityLinks();
    }
}
