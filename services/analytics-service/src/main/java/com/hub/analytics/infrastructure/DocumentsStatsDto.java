package com.hub.analytics.infrastructure;

import com.hub.analytics.application.DocumentsSummary;

/** Wire shape of documents-service's DocumentsStatsResponse. */
public record DocumentsStatsDto(
        long totalDocuments,
        long sensitiveDocuments,
        long totalCategories,
        long downloadsLogged) {

    public DocumentsSummary toSummary() {
        return new DocumentsSummary(true, totalDocuments, sensitiveDocuments, totalCategories,
                downloadsLogged);
    }
}
