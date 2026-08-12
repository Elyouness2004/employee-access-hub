package com.hub.hr.api;

import java.util.List;
import java.util.UUID;

import com.hub.hr.api.dto.NotificationCountResponse;
import com.hub.hr.api.dto.NotificationPageResponse;
import com.hub.hr.api.dto.NotificationReadAllResponse;
import com.hub.hr.api.dto.NotificationResponse;
import com.hub.hr.application.NotificationQueryService;
import com.hub.hr.application.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Notification Center (self-service): the authenticated employee reads their own
 * notification history and flips read/unread state. Coarse authentication is
 * enforced by the resource server ({@code /api/**}) and re-asserted here with
 * {@code @PreAuthorize}; fine-grained ownership lives in the application layer (a
 * caller only ever sees or marks their own — zero trust, defense-in-depth layer
 * 3), same shape as {@link SessionController}. The surface is read + read-state
 * only: there is no create, update-content or delete endpoint — notifications are
 * raised by business events and are otherwise immutable history.
 */
@RestController
@RequestMapping("/api/hr/notifications")
@PreAuthorize("isAuthenticated()")
@Tag(name = "Notification Center")
public class NotificationController {

    /** Clamp on the history page size so a client can never request an unbounded page. */
    private static final int MAX_PAGE_SIZE = 100;

    private final NotificationQueryService queries;
    private final NotificationService notifications;

    public NotificationController(NotificationQueryService queries, NotificationService notifications) {
        this.queries = queries;
        this.notifications = notifications;
    }

    @GetMapping
    @Operation(summary = "My notification history, newest first (paged)")
    public NotificationPageResponse history(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                            @PageableDefault(size = 20) Pageable pageable) {
        return NotificationPageResponse.from(queries.history(Actors.from(jwt, auth), sanitize(pageable)));
    }

    @GetMapping("/unread")
    @Operation(summary = "My unread notifications, newest first")
    public List<NotificationResponse> unread(@AuthenticationPrincipal Jwt jwt, Authentication auth) {
        return queries.unread(Actors.from(jwt, auth)).stream().map(NotificationResponse::from).toList();
    }

    @GetMapping("/count")
    @Operation(summary = "My unread-notification count (badge)")
    public NotificationCountResponse count(@AuthenticationPrincipal Jwt jwt, Authentication auth) {
        return NotificationCountResponse.of(queries.unreadCount(Actors.from(jwt, auth)));
    }

    @GetMapping("/{id}")
    @Operation(summary = "One of my notifications by id (404 if it is not mine)")
    public NotificationResponse byId(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                     @PathVariable UUID id) {
        return NotificationResponse.from(queries.byId(Actors.from(jwt, auth), id));
    }

    @PatchMapping("/{id}/read")
    @Operation(summary = "Mark one of my notifications read (idempotent; 404 if it is not mine)")
    public NotificationResponse markRead(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                         @PathVariable UUID id) {
        return NotificationResponse.from(notifications.markRead(Actors.from(jwt, auth), id));
    }

    @PatchMapping("/read-all")
    @Operation(summary = "Mark all my unread notifications read; returns how many changed")
    public NotificationReadAllResponse markAllRead(@AuthenticationPrincipal Jwt jwt, Authentication auth) {
        return NotificationReadAllResponse.of(notifications.markAllRead(Actors.from(jwt, auth)));
    }

    /**
     * Keep only page + clamped size; ordering is fixed to newest-first by the
     * repository query, so any client-supplied sort is dropped (never a 500).
     */
    private static Pageable sanitize(Pageable pageable) {
        int size = Math.min(Math.max(pageable.getPageSize(), 1), MAX_PAGE_SIZE);
        return PageRequest.of(pageable.getPageNumber(), size, Sort.unsorted());
    }
}
