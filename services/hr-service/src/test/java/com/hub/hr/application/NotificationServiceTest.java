package com.hub.hr.application;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.hub.hr.domain.notification.Notification;
import com.hub.hr.domain.notification.NotificationStatus;
import com.hub.hr.domain.notification.NotificationType;
import com.hub.hr.infrastructure.NotificationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Write side of the Notification Center: single-entry creation, ownership-enforced
 * read-state changes, idempotent mark-read, and an audit entry on every real
 * transition (mirrors {@link SessionServiceTest}).
 */
@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock
    NotificationRepository notifications;
    @Mock
    AuditTrail audit;

    NotificationService service;

    final UUID recipientId = UUID.randomUUID();
    final UUID employeeId = UUID.randomUUID();
    final Actor actor = new Actor(recipientId, "jane.doe", false);

    @BeforeEach
    void setUp() {
        service = new NotificationService(notifications, audit);
    }

    @Test
    void createPersistsWithTheTypeDefaultsAndCorrelationId() {
        service.create(recipientId, employeeId, NotificationType.PASSWORD_RESET, "corr-1");

        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        verify(notifications).save(saved.capture());
        Notification n = saved.getValue();
        assertThat(n.getRecipientId()).isEqualTo(recipientId);
        assertThat(n.getEmployeeId()).isEqualTo(employeeId);
        assertThat(n.getType()).isEqualTo(NotificationType.PASSWORD_RESET);
        assertThat(n.getTitle()).isEqualTo(NotificationType.PASSWORD_RESET.title());
        assertThat(n.getMessage()).isEqualTo(NotificationType.PASSWORD_RESET.message());
        assertThat(n.getCorrelationId()).isEqualTo("corr-1");
        assertThat(n.isUnread()).isTrue();
    }

    @Test
    void createIsANoOpForAnUnprovisionedRecipient() {
        service.create(null, employeeId, NotificationType.ADMIN_ACTION, "corr");
        verifyNoInteractions(notifications);
    }

    @Test
    void markReadFlipsUnreadToReadSavesAndAudits() {
        UUID id = UUID.randomUUID();
        Notification n = new Notification(recipientId, employeeId, NotificationType.LEAVE_APPROVED,
                "t", "m", "corr");
        when(notifications.findByIdAndRecipientId(id, recipientId)).thenReturn(Optional.of(n));

        Notification result = service.markRead(actor, id);

        assertThat(result.getStatus()).isEqualTo(NotificationStatus.READ);
        verify(notifications).save(n);
        verify(audit).record(eq("jane.doe"), eq("NOTIFICATION_READ"), eq("notification:" + id),
                contains("correlationId="));
    }

    @Test
    void markReadIsIdempotentAndDoesNotReauditAnAlreadyReadNotification() {
        UUID id = UUID.randomUUID();
        Notification n = new Notification(recipientId, employeeId, NotificationType.LEAVE_APPROVED,
                "t", "m", "corr");
        n.markRead(); // already read

        when(notifications.findByIdAndRecipientId(id, recipientId)).thenReturn(Optional.of(n));

        service.markRead(actor, id);

        verify(notifications, never()).save(any());
        verifyNoInteractions(audit);
    }

    @Test
    void markReadOnANotificationThatIsNotTheCallersIs404() {
        UUID id = UUID.randomUUID();
        when(notifications.findByIdAndRecipientId(id, recipientId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.markRead(actor, id))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(notifications, never()).save(any());
        verifyNoInteractions(audit);
    }

    @Test
    void markAllReadMarksEveryUnreadSavesAllAndAuditsTheCount() {
        Notification a = new Notification(recipientId, employeeId, NotificationType.LEAVE_SUBMITTED, "t", "m", "c");
        Notification b = new Notification(recipientId, employeeId, NotificationType.EXPENSE_SUBMITTED, "t", "m", "c");
        when(notifications.findByRecipientIdAndStatusOrderByCreatedAtDesc(recipientId, NotificationStatus.UNREAD))
                .thenReturn(List.of(a, b));

        int changed = service.markAllRead(actor);

        assertThat(changed).isEqualTo(2);
        assertThat(a.getStatus()).isEqualTo(NotificationStatus.READ);
        assertThat(b.getStatus()).isEqualTo(NotificationStatus.READ);
        verify(notifications).saveAll(List.of(a, b));
        verify(audit).record(eq("jane.doe"), eq("NOTIFICATION_READ_ALL"), eq("user:" + recipientId),
                contains("2 notification"));
    }

    @Test
    void markAllReadWithNoUnreadDoesNothingAndReturnsZero() {
        when(notifications.findByRecipientIdAndStatusOrderByCreatedAtDesc(recipientId, NotificationStatus.UNREAD))
                .thenReturn(List.of());

        assertThat(service.markAllRead(actor)).isZero();
        verify(notifications, never()).saveAll(any());
        verifyNoInteractions(audit);
    }
}
