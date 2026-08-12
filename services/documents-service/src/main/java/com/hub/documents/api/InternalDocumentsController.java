package com.hub.documents.api;

import com.hub.documents.api.dto.OffboardingRequest;
import com.hub.documents.api.dto.OffboardingResult;
import com.hub.documents.application.DocumentService;
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
@RequestMapping("/internal/documents")
@Tag(name = "Internal — service-to-service")
public class InternalDocumentsController {

    private final DocumentService documentService;

    public InternalDocumentsController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @PostMapping("/offboarding")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "Revoke the offboarded employee's document ownership (audit trail preserved)")
    public OffboardingResult offboarding(@AuthenticationPrincipal Jwt jwt,
                                         Authentication authentication,
                                         @Valid @RequestBody OffboardingRequest request) {
        return documentService.offboard(Actors.from(jwt, authentication), request.employeeKeycloakId());
    }
}
