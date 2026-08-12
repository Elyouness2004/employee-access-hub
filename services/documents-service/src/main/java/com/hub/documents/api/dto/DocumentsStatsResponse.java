package com.hub.documents.api.dto;

/** Aggregate KPIs for the analytics context (P6.2). */
public record DocumentsStatsResponse(
        long totalDocuments,
        long sensitiveDocuments,
        long totalCategories,
        long downloadsLogged) {
}
