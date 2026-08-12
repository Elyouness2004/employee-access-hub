package com.hub.hr.application;

import java.util.UUID;

/**
 * The authenticated caller as the application layer sees it (mirrors the leave
 * and expense contexts): identity for audit/ownership and whether the caller
 * holds HR/Admin. {@link #system()} represents the platform itself when identity
 * actions are triggered automatically (auto-onboarding, sync).
 */
public record Actor(UUID keycloakId, String username, boolean hrOrAdmin) {

    public static Actor system() {
        return new Actor(null, "system", true);
    }
}
