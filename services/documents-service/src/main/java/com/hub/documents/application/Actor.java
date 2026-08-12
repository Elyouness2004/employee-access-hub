package com.hub.documents.application;

import java.util.UUID;

import com.hub.documents.domain.AccessRole;

/**
 * The authenticated caller as the application layer sees it: identity for
 * ownership checks and the caller's highest {@link AccessRole} for the category
 * role gate (FR-41).
 */
public record Actor(UUID keycloakId, String username, AccessRole role) {

    public boolean hrOrAdmin() {
        return role.isSensitiveTier();
    }
}
