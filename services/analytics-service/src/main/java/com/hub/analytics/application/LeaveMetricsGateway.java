package com.hub.analytics.application;

/** Port to leave-service metrics — degrades to {@link LeaveSummary#unavailable()}. */
public interface LeaveMetricsGateway {

    LeaveSummary leaveSummary();
}
