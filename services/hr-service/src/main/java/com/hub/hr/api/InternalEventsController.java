package com.hub.hr.api;

import java.util.List;

import com.hub.hr.api.dto.OutboxEventResponse;
import com.hub.hr.application.IdentityQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Service-to-service view of the emitted lifecycle events (Part 5) — the outbox
 * trail, whether or not a broker is attached. Internal-only, HR/Admin token
 * required.
 */
@RestController
@RequestMapping("/internal/events")
@PreAuthorize("hasAnyRole('HR', 'ADMIN')")
@Tag(name = "Internal — service-to-service")
public class InternalEventsController {

    private final IdentityQueryService queries;

    public InternalEventsController(IdentityQueryService queries) {
        this.queries = queries;
    }

    @GetMapping
    @Operation(summary = "Recent lifecycle events (outbox)")
    public List<OutboxEventResponse> events() {
        return queries.recentEvents();
    }
}
