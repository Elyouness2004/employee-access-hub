package com.hub.hr.application;

import java.util.UUID;

import org.slf4j.MDC;

/**
 * Resolves the correlation id for the current request so a lifecycle event can
 * be traced across services (Part 4). The gateway injects the id (P1.8); when it
 * is absent (system-triggered flows, tests) a fresh one is minted.
 */
public final class Correlation {

    public static final String MDC_KEY = "correlationId";

    private Correlation() {
    }

    public static String currentOrNew() {
        String id = MDC.get(MDC_KEY);
        return (id != null && !id.isBlank()) ? id : UUID.randomUUID().toString();
    }
}
