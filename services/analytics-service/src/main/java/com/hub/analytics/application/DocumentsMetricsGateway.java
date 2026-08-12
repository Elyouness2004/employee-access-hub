package com.hub.analytics.application;

/** Port to documents-service metrics — degrades to {@link DocumentsSummary#unavailable()}. */
public interface DocumentsMetricsGateway {

    DocumentsSummary documentsSummary();
}
