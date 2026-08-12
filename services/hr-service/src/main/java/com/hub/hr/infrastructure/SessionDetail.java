package com.hub.hr.infrastructure;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * Local supplement to a Keycloak SSO session (Part 8): the attributes the admin
 * session representation does not carry — browser, operating system, device name
 * and whether MFA was used — keyed by the Keycloak session id (the access token's
 * {@code sid}). Captured from the request that owns the session and merged onto
 * the authoritative Keycloak list by the application layer, so nothing Keycloak
 * already provides is duplicated here. The raw user-agent is kept as provenance
 * and as a fallback when parsing cannot classify it.
 */
@Entity
@Table(name = "session_detail")
public class SessionDetail {

    @Id
    @Column(name = "session_id", length = 100)
    private String sessionId;

    @Column(name = "keycloak_id", nullable = false)
    private UUID keycloakId;

    @Column(length = 100)
    private String browser;

    @Column(name = "operating_system", length = 100)
    private String operatingSystem;

    @Column(name = "device_name", length = 120)
    private String deviceName;

    @Column(name = "user_agent", length = 1024)
    private String userAgent;

    @Column(name = "mfa_used", nullable = false)
    private boolean mfaUsed;

    @CreationTimestamp
    @Column(name = "captured_at", nullable = false, updatable = false)
    private Instant capturedAt;

    @UpdateTimestamp
    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    protected SessionDetail() {
        // JPA only
    }

    public SessionDetail(String sessionId, UUID keycloakId, String browser, String operatingSystem,
                         String deviceName, String userAgent, boolean mfaUsed) {
        this.sessionId = sessionId;
        this.keycloakId = keycloakId;
        this.browser = browser;
        this.operatingSystem = operatingSystem;
        this.deviceName = deviceName;
        this.userAgent = userAgent;
        this.mfaUsed = mfaUsed;
    }

    /** Refresh the captured attributes when the owning session is seen again. */
    public void refresh(String browser, String operatingSystem, String deviceName,
                        String userAgent, boolean mfaUsed) {
        this.browser = browser;
        this.operatingSystem = operatingSystem;
        this.deviceName = deviceName;
        this.userAgent = userAgent;
        this.mfaUsed = mfaUsed;
    }

    public String getSessionId() {
        return sessionId;
    }

    public UUID getKeycloakId() {
        return keycloakId;
    }

    public String getBrowser() {
        return browser;
    }

    public String getOperatingSystem() {
        return operatingSystem;
    }

    public String getDeviceName() {
        return deviceName;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public boolean isMfaUsed() {
        return mfaUsed;
    }

    public Instant getCapturedAt() {
        return capturedAt;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }
}
