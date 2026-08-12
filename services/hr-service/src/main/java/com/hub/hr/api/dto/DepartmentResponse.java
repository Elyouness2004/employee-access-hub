package com.hub.hr.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.hub.hr.domain.Department;

public record DepartmentResponse(
        UUID id,
        String name,
        String description,
        Instant createdAt,
        Instant updatedAt) {

    public static DepartmentResponse from(Department department) {
        return new DepartmentResponse(
                department.getId(),
                department.getName(),
                department.getDescription(),
                department.getCreatedAt(),
                department.getUpdatedAt());
    }
}
