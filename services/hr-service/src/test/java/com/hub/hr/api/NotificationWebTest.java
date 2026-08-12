package com.hub.hr.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.hub.hr.config.KeycloakRealmRoleConverter;
import com.hub.hr.domain.notification.NotificationStatus;
import com.hub.hr.domain.notification.NotificationType;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Notification Center API (self-service): history/unread/count/read/read-all with
 * fine-grained ownership (a foreign id is a 404), unread-count and read-state
 * transitions, audit integration, RBAC (401), validation (400) and the OpenAPI
 * surface. Built on the shared identity web fixture; notifications are JDBC-seeded
 * with explicit timestamps for deterministic ordering.
 */
class NotificationWebTest extends IdentityWebTestSupport {

    private static final UUID RECIPIENT = UUID.fromString("22222222-2222-2222-2222-222222222222");

    @Test
    void historyListsMyNotificationsNewestFirstAndExcludesOthers() throws Exception {
        Instant now = Instant.now();
        seed(RECIPIENT, NotificationType.EMPLOYEE_PROVISIONED, NotificationStatus.READ, now.minusSeconds(30));
        seed(RECIPIENT, NotificationType.PASSWORD_RESET, NotificationStatus.UNREAD, now.minusSeconds(20));
        seed(RECIPIENT, NotificationType.ACCOUNT_LOCKED, NotificationStatus.UNREAD, now.minusSeconds(10));
        seed(UUID.randomUUID(), NotificationType.LEAVE_APPROVED, NotificationStatus.UNREAD, now);

        mockMvc.perform(get("/api/hr/notifications").with(recipient("EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.content.length()").value(3))
                .andExpect(jsonPath("$.content[0].type").value("ACCOUNT_LOCKED"))
                .andExpect(jsonPath("$.content[0].category").value("SECURITY"))
                .andExpect(jsonPath("$.content[0].read").value(false))
                .andExpect(jsonPath("$.content[2].type").value("EMPLOYEE_PROVISIONED"));
    }

    @Test
    void unreadReturnsOnlyMyUnreadNotifications() throws Exception {
        Instant now = Instant.now();
        seed(RECIPIENT, NotificationType.PASSWORD_RESET, NotificationStatus.UNREAD, now.minusSeconds(20));
        seed(RECIPIENT, NotificationType.ACCOUNT_LOCKED, NotificationStatus.UNREAD, now.minusSeconds(10));
        seed(RECIPIENT, NotificationType.EMPLOYEE_PROVISIONED, NotificationStatus.READ, now.minusSeconds(30));

        mockMvc.perform(get("/api/hr/notifications/unread").with(recipient("EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].read").value(false));
    }

    @Test
    void countReturnsTheUnreadBadge() throws Exception {
        Instant now = Instant.now();
        seed(RECIPIENT, NotificationType.PASSWORD_RESET, NotificationStatus.UNREAD, now);
        seed(RECIPIENT, NotificationType.ACCOUNT_LOCKED, NotificationStatus.UNREAD, now);
        seed(RECIPIENT, NotificationType.EMPLOYEE_PROVISIONED, NotificationStatus.READ, now);

        mockMvc.perform(get("/api/hr/notifications/count").with(recipient("EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unread").value(2));
    }

    @Test
    void oneOwnNotificationCanBeReadByIdAndAForeignOneIs404() throws Exception {
        Instant now = Instant.now();
        UUID mine = seed(RECIPIENT, NotificationType.PASSWORD_RESET, NotificationStatus.UNREAD, now);
        UUID foreign = seed(UUID.randomUUID(), NotificationType.LEAVE_APPROVED, NotificationStatus.UNREAD, now);

        mockMvc.perform(get("/api/hr/notifications/" + mine).with(recipient("EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(mine.toString()))
                .andExpect(jsonPath("$.type").value("PASSWORD_RESET"));

        mockMvc.perform(get("/api/hr/notifications/" + foreign).with(recipient("EMPLOYEE")))
                .andExpect(status().isNotFound());
    }

    @Test
    void markReadFlipsToReadIsIdempotentAndIsAudited() throws Exception {
        UUID id = seed(RECIPIENT, NotificationType.PASSWORD_RESET, NotificationStatus.UNREAD, Instant.now());

        mockMvc.perform(patch("/api/hr/notifications/" + id + "/read").with(recipient("EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.read").value(true))
                .andExpect(jsonPath("$.status").value("READ"));

        // idempotent: a second read still succeeds and stays read
        mockMvc.perform(patch("/api/hr/notifications/" + id + "/read").with(recipient("EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.read").value(true));

        mockMvc.perform(get("/api/hr/notifications/count").with(recipient("EMPLOYEE")))
                .andExpect(jsonPath("$.unread").value(0));

        // only the real UNREAD->READ transition is audited (the repeat is a no-op)
        assertThat(auditCount("NOTIFICATION_READ")).isEqualTo(1);
    }

    @Test
    void markReadOnAForeignNotificationIs404() throws Exception {
        UUID foreign = seed(UUID.randomUUID(), NotificationType.LEAVE_APPROVED, NotificationStatus.UNREAD, Instant.now());

        mockMvc.perform(patch("/api/hr/notifications/" + foreign + "/read").with(recipient("EMPLOYEE")))
                .andExpect(status().isNotFound());
        assertThat(auditCount("NOTIFICATION_READ")).isZero();
    }

    @Test
    void markAllReadMarksEveryUnreadReturnsTheCountAndIsAudited() throws Exception {
        Instant now = Instant.now();
        seed(RECIPIENT, NotificationType.PASSWORD_RESET, NotificationStatus.UNREAD, now.minusSeconds(20));
        seed(RECIPIENT, NotificationType.ACCOUNT_LOCKED, NotificationStatus.UNREAD, now.minusSeconds(10));
        seed(RECIPIENT, NotificationType.EMPLOYEE_PROVISIONED, NotificationStatus.READ, now.minusSeconds(30));

        mockMvc.perform(patch("/api/hr/notifications/read-all").with(recipient("EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.markedRead").value(2));

        mockMvc.perform(get("/api/hr/notifications/count").with(recipient("EMPLOYEE")))
                .andExpect(jsonPath("$.unread").value(0));
        assertThat(auditCount("NOTIFICATION_READ_ALL")).isEqualTo(1);
    }

    @Test
    void unauthenticatedAccessIsRejected() throws Exception {
        mockMvc.perform(get("/api/hr/notifications"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aMalformedIdIsABadRequest() throws Exception {
        mockMvc.perform(get("/api/hr/notifications/not-a-uuid").with(recipient("EMPLOYEE")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void openApiDocumentsTheNotificationEndpoints() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/hr/notifications']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/hr/notifications/unread']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/hr/notifications/count']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/hr/notifications/{id}']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/hr/notifications/{id}/read']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/hr/notifications/read-all']", notNullValue()));
    }

    private UUID seed(UUID recipientId, NotificationType type, NotificationStatus status, Instant createdAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into hr.notification (id, recipient_id, employee_id, type, status, title, "
                        + "message, correlation_id, created_at, read_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, recipientId, null, type.name(), status.name(), type.title(), type.message(),
                "corr", createdAt, null);
        return id;
    }

    private int auditCount(String action) {
        Integer count = jdbc.queryForObject(
                "select count(*) from hr.audit_log where action = ?", Integer.class, action);
        return count == null ? 0 : count;
    }

    /** A Keycloak-shaped token whose subject is the fixed recipient. */
    private static RequestPostProcessor recipient(String... roles) {
        Jwt token = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(RECIPIENT.toString())
                .issuer("http://test-issuer/realms/employee-hub")
                .audience(List.of("hub-api"))
                .claim("preferred_username", "jane.doe")
                .claim("realm_access", Map.of("roles", List.of(roles)))
                .build();
        return jwt().jwt(token).authorities(new KeycloakRealmRoleConverter());
    }
}
