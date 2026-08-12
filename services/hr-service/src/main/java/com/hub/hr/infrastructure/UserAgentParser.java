package com.hub.hr.infrastructure;

/**
 * Minimal, dependency-free User-Agent classifier (Part 8): enough to fill the
 * browser / OS / device columns Keycloak's admin session representation does not
 * carry, without pulling in a parsing library. Heuristic by design — the raw
 * user-agent is persisted alongside so nothing is lost when a string cannot be
 * classified (fields fall back to {@code null}).
 */
public final class UserAgentParser {

    /** Parsed device attributes; any field may be {@code null} when undetermined. */
    public record Parsed(String browser, String operatingSystem, String device) {
    }

    private UserAgentParser() {
    }

    public static Parsed parse(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return new Parsed(null, null, null);
        }
        return new Parsed(browser(userAgent), operatingSystem(userAgent), device(userAgent));
    }

    private static String browser(String ua) {
        if (ua.contains("Edg")) {
            return "Edge";
        }
        if (ua.contains("OPR") || ua.contains("Opera")) {
            return "Opera";
        }
        if (ua.contains("Chrome") || ua.contains("Chromium")) {
            return "Chrome";
        }
        if (ua.contains("Firefox")) {
            return "Firefox";
        }
        if (ua.contains("Safari")) {
            return "Safari";
        }
        return null;
    }

    private static String operatingSystem(String ua) {
        if (ua.contains("Windows")) {
            return "Windows";
        }
        if (ua.contains("iPhone") || ua.contains("iPad") || ua.contains("iOS")) {
            return "iOS";
        }
        if (ua.contains("Mac OS X") || ua.contains("Macintosh")) {
            return "macOS";
        }
        if (ua.contains("Android")) {
            return "Android";
        }
        if (ua.contains("Linux")) {
            return "Linux";
        }
        return null;
    }

    private static String device(String ua) {
        if (ua.contains("iPhone")) {
            return "iPhone";
        }
        if (ua.contains("iPad")) {
            return "iPad";
        }
        if (ua.contains("Android")) {
            return ua.contains("Mobile") ? "Android phone" : "Android tablet";
        }
        if (ua.contains("Mobile")) {
            return "Mobile";
        }
        return "Desktop";
    }
}
