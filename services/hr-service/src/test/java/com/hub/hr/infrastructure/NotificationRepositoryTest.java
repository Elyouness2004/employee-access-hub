package com.hub.hr.infrastructure;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.hub.hr.domain.notification.Notification;
import com.hub.hr.domain.notification.NotificationStatus;
import com.hub.hr.domain.notification.NotificationType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Repository queries on H2/Flyway: recipient scoping (a caller never sees another
 * recipient's rows), newest-first ordering, status filtering, unread count and the
 * ownership-scoped single fetch. Rows are JDBC-seeded with explicit timestamps
 * (the existing fixture style) so ordering is deterministic. Transactional: each
 * test rolls back.
 */
@SpringBootTest(properties =
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks")
@Transactional
class NotificationRepositoryTest {

    @Autowired
    NotificationRepository notifications;
    @Autowired
    JdbcTemplate jdbc;

    final UUID recipient = UUID.randomUUID();
    final UUID other = UUID.randomUUID();

    @Test
    void returnsOnlyTheRecipientsNotificationsNewestFirst() {
        Instant now = Instant.now();
        UUID oldest = seed(recipient, NotificationType.EMPLOYEE_PROVISIONED, NotificationStatus.READ, now.minusSeconds(30));
        UUID middle = seed(recipient, NotificationType.PASSWORD_RESET, NotificationStatus.UNREAD, now.minusSeconds(20));
        UUID newest = seed(recipient, NotificationType.ACCOUNT_LOCKED, NotificationStatus.UNREAD, now.minusSeconds(10));
        seed(other, NotificationType.LEAVE_APPROVED, NotificationStatus.UNREAD, now);

        List<Notification> page = notifications
                .findByRecipientIdOrderByCreatedAtDesc(recipient, PageRequest.of(0, 10)).getContent();

        assertThat(page).extracting(Notification::getId).containsExactly(newest, middle, oldest);
    }

    @Test
    void filtersByStatus() {
        Instant now = Instant.now();
        seed(recipient, NotificationType.PASSWORD_RESET, NotificationStatus.UNREAD, now.minusSeconds(20));
        seed(recipient, NotificationType.ACCOUNT_LOCKED, NotificationStatus.UNREAD, now.minusSeconds(10));
        seed(recipient, NotificationType.EMPLOYEE_PROVISIONED, NotificationStatus.READ, now.minusSeconds(30));

        List<Notification> unread = notifications
                .findByRecipientIdAndStatusOrderByCreatedAtDesc(recipient, NotificationStatus.UNREAD);

        assertThat(unread).hasSize(2).allMatch(Notification::isUnread);
    }

    @Test
    void countsUnreadForTheRecipientOnly() {
        Instant now = Instant.now();
        seed(recipient, NotificationType.PASSWORD_RESET, NotificationStatus.UNREAD, now);
        seed(recipient, NotificationType.ACCOUNT_LOCKED, NotificationStatus.UNREAD, now);
        seed(recipient, NotificationType.EMPLOYEE_PROVISIONED, NotificationStatus.READ, now);
        seed(other, NotificationType.LEAVE_APPROVED, NotificationStatus.UNREAD, now);

        assertThat(notifications.countByRecipientIdAndStatus(recipient, NotificationStatus.UNREAD)).isEqualTo(2);
    }

    @Test
    void singleFetchIsScopedToTheOwner() {
        Instant now = Instant.now();
        UUID mine = seed(recipient, NotificationType.PASSWORD_RESET, NotificationStatus.UNREAD, now);
        UUID foreign = seed(other, NotificationType.LEAVE_APPROVED, NotificationStatus.UNREAD, now);

        assertThat(notifications.findByIdAndRecipientId(mine, recipient)).isPresent();
        assertThat(notifications.findByIdAndRecipientId(foreign, recipient)).isEmpty();
    }

    private UUID seed(UUID recipientId, NotificationType type, NotificationStatus status, Instant createdAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into hr.notification (id, recipient_id, employee_id, type, status, title, "
                        + "message, correlation_id, created_at, read_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, recipientId, null, type.name(), status.name(), type.title(), type.message(),
                "corr", createdAt, null);
        return id;
    }
}
