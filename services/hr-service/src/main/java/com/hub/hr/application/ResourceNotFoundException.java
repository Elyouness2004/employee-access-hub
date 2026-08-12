package com.hub.hr.application;

import java.util.UUID;

/** Requested resource id does not exist — maps to 404. */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String resource, UUID id) {
        super(resource + " " + id + " does not exist");
    }

    /** For resources keyed by a non-UUID identifier (e.g. a Keycloak session id). */
    public ResourceNotFoundException(String resource, String id) {
        super(resource + " " + id + " does not exist");
    }
}
