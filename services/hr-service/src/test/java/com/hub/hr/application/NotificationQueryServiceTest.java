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
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageImpl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Read side of the Notification Center: every query is recipient-scoped, the
 * recent feed clamps its limit, and a foreign id is a 404 (mirrors
 * {@link SessionQueryService} coverage).
 */
@ExtendWith(MockitoExtension.class)
class NotificationQueryServiceTest {

    @Mock
    NotificationRepository notifications;

    NotificationQueryService service;

    final UUID recipientId = UUID.randomUUID();
    final Actor actor = new Actor(recipientId, "jane.doe", false);

    @BeforeEach
    void setUp() {
        service = new NotificationQueryService(notifications);
    }

    @Test
    void unreadDelegatesToTheStatusScopedQuery() {
        Notification n = notification(NotificationType.PASSWORD_RESET);
        when(notifications.findByRecipientIdAndStatusOrderByCreatedAtDesc(recipientId, NotificationStatus.UNREAD))
                .thenReturn(List.of(n));

        assertThat(service.unread(actor)).containsExactly(n);
    }

    @Test
    void unreadCountDelegates() {
        when(notifications.countByRecipientIdAndStatus(recipientId, NotificationStatus.UNREAD)).thenReturn(4L);

        assertThat(service.unreadCount(actor)).isEqualTo(4L);
    }

    @Test
    void recentClampsTheLimitAndAsksForThatManyNewestFirst() {
        when(notifications.findByRecipientIdOrderByCreatedAtDesc(eq(recipientId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        service.recent(actor, 5);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(notifications).findByRecipientIdOrderByCreatedAtDesc(eq(recipientId), pageable.capture());
        assertThat(pageable.getValue().getPageNumber()).isZero();
        assertThat(pageable.getValue().getPageSize()).isEqualTo(5);
    }

    @Test
    void recentIsCappedAtTheMaximumFeedSize() {
        when(notifications.findByRecipientIdOrderByCreatedAtDesc(eq(recipientId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        service.recent(actor, 9_999);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(notifications).findByRecipientIdOrderByCreatedAtDesc(eq(recipientId), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(NotificationQueryService.MAX_RECENT);
    }

    @Test
    void byIdReturnsTheOwnedNotification() {
        UUID id = UUID.randomUUID();
        Notification n = notification(NotificationType.LEAVE_APPROVED);
        when(notifications.findByIdAndRecipientId(id, recipientId)).thenReturn(Optional.of(n));

        assertThat(service.byId(actor, id)).isSameAs(n);
    }

    @Test
    void byIdIsNotFoundForAForeignId() {
        UUID id = UUID.randomUUID();
        when(notifications.findByIdAndRecipientId(id, recipientId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.byId(actor, id)).isInstanceOf(ResourceNotFoundException.class);
    }

    private Notification notification(NotificationType type) {
        return new Notification(recipientId, UUID.randomUUID(), type, type.title(), type.message(), "corr");
    }
}
