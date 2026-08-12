package com.hub.documents.api;

import com.hub.documents.api.dto.DocumentsStatsResponse;
import com.hub.documents.application.DocumentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Service-to-service stats API (P6.2). Not routed by the gateway: reachable only
 * on the internal backend network, called by analytics-service with an HR/Admin
 * token relayed — hence the HR/ADMIN requirement.
 */
@RestController
@RequestMapping("/internal/stats")
@Tag(name = "Internal — service-to-service")
public class InternalDocumentsStatsController {

    private final DocumentService documentService;

    public InternalDocumentsStatsController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "Aggregate document KPIs for the analytics context")
    public DocumentsStatsResponse stats() {
        return documentService.stats();
    }
}
