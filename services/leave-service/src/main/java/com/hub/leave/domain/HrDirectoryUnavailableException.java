package com.hub.leave.domain;

/**
 * hr-service unreachable AND no cached snapshot — the caller fails fast with
 * 503 instead of cascading (circuit-breaker fallback of last resort).
 */
public class HrDirectoryUnavailableException extends RuntimeException {

    public HrDirectoryUnavailableException(Throwable cause) {
        super("hr-service is unavailable and no cached employee snapshot exists", cause);
    }
}
