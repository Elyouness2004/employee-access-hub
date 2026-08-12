package com.hub.analytics.infrastructure;

import com.hub.analytics.application.DocumentsMetricsGateway;
import com.hub.analytics.application.DocumentsSummary;

public class RestDocumentsMetricsGateway implements DocumentsMetricsGateway {

    private final DocumentsStatsClient client;
    private final ResilientMetricsSource<DocumentsSummary> source;

    public RestDocumentsMetricsGateway(DocumentsStatsClient client,
                                       ResilientMetricsSource<DocumentsSummary> source) {
        this.client = client;
        this.source = source;
    }

    @Override
    public DocumentsSummary documentsSummary() {
        return source.fetch(() -> client.stats().toSummary());
    }
}
