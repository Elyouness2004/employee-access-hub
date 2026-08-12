package com.hub.hr.api.dto;

import java.util.List;

import com.hub.hr.domain.notification.Notification;
import org.springframework.data.domain.Page;

/**
 * A page of notifications with the paging metadata a client needs. Built from a
 * Spring Data {@link Page} rather than exposing {@code PageImpl} directly, so the
 * JSON contract is explicit and stable (mirrors {@code AuditPageResponse}).
 */
public record NotificationPageResponse(
        List<NotificationResponse> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last) {

    public static NotificationPageResponse from(Page<Notification> page) {
        return new NotificationPageResponse(
                page.getContent().stream().map(NotificationResponse::from).toList(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.isFirst(),
                page.isLast());
    }
}
