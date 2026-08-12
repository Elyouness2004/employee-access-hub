package com.hub.documents.application;

import java.util.UUID;

/** A referenced resource does not exist — maps to 404. */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String resource, UUID id) {
        super(resource + " " + id + " not found");
    }
}
