package com.hub.hr.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.hub.hr.domain.Position;

public record PositionResponse(
        UUID id,
        String title,
        String description,
        Instant createdAt,
        Instant updatedAt) {

    public static PositionResponse from(Position position) {
        return new PositionResponse(
                position.getId(),
                position.getTitle(),
                position.getDescription(),
                position.getCreatedAt(),
                position.getUpdatedAt());
    }
}
