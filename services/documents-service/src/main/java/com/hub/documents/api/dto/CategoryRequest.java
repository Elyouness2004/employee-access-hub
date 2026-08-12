package com.hub.documents.api.dto;

import com.hub.documents.domain.AccessRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Create/update a document category (Admin). */
public record CategoryRequest(
        @NotBlank @Size(max = 100) String name,
        @Size(max = 500) String description,
        @NotNull AccessRole minRole) {
}
