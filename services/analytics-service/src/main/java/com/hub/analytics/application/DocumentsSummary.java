package com.hub.analytics.application;

public record DocumentsSummary(
        boolean available,
        long totalDocuments,
        long sensitiveDocuments,
        long totalCategories,
        long downloadsLogged) {

    public static DocumentsSummary unavailable() {
        return new DocumentsSummary(false, 0, 0, 0, 0);
    }
}
