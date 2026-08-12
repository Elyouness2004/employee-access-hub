package com.hub.hr.application;

/**
 * Generates the temporary password an onboarded account starts with (P3.2). The
 * password is never stored: it is handed to Keycloak with a forced change on
 * first login. Behind a port so tests stay deterministic.
 */
public interface PasswordGenerator {

    String generateTemporary();
}
