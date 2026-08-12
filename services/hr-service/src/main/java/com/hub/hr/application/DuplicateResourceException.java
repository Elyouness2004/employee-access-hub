package com.hub.hr.application;

/** Violates a uniqueness rule (name, title, matricule, email) — maps to 409. */
public class DuplicateResourceException extends RuntimeException {

    public DuplicateResourceException(String message) {
        super(message);
    }
}
