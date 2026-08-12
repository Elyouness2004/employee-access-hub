package com.hub.leave.application;

import java.util.UUID;

/**
 * The authenticated caller as the application layer sees it: identity for
 * ownership checks (layer 3) and the one role distinction ownership rules
 * need — whether the caller may act on HR-escalated requests.
 */
public record Actor(UUID keycloakId, String username, boolean hrOrAdmin) {
}
