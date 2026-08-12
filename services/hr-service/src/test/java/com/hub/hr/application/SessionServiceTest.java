package com.hub.hr.application;

import java.util.Optional;
import java.util.UUID;

import com.hub.hr.infrastructure.SessionDetail;
import com.hub.hr.infrastructure.SessionDetailRepository;
import com.hub.hr.support.RecordingSessionDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SessionServiceTest {

    private static final String CHROME_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";

    @Mock
    SessionDetailRepository details;
    @Mock
    AuditTrail audit;

    RecordingSessionDirectory directory = new RecordingSessionDirectory();
    SessionService service;

    final UUID keycloakId = UUID.randomUUID();
    final Actor actor = new Actor(keycloakId, "jane.doe", false);

    @BeforeEach
    void setUp() {
        directory.reset();
        service = new SessionService(directory, details, audit);
    }

    @Test
    void terminatesAnOwnedSessionAndWritesAnAuditEntry() {
        directory.seed("s1", keycloakId);

        service.terminate(actor, "s1", "current-sid", false);

        assertThat(directory.terminated).containsExactly("s1");
        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(audit).record(eq("jane.doe"), eq("LOGOUT_SESSION"), eq("session:s1"), detail.capture());
        assertThat(detail.getValue()).contains("session terminated").contains("correlationId=");
    }

    @Test
    void refusesToTerminateASessionThatIsNotTheCallersOwn() {
        directory.seed("someone-else", UUID.randomUUID());

        assertThatThrownBy(() -> service.terminate(actor, "someone-else", "current-sid", false))
                .isInstanceOf(ResourceNotFoundException.class);
        assertThat(directory.terminated).isEmpty();
        verifyNoInteractions(audit);
    }

    @Test
    void terminatingTheCurrentSessionWithoutConfirmationIsRejected() {
        directory.seed("current-sid", keycloakId);

        assertThatThrownBy(() -> service.terminate(actor, "current-sid", "current-sid", false))
                .isInstanceOf(CurrentSessionConfirmationRequiredException.class);
        assertThat(directory.terminated).isEmpty();
        verifyNoInteractions(audit);
    }

    @Test
    void terminatingTheCurrentSessionWithConfirmationSucceeds() {
        directory.seed("current-sid", keycloakId);

        service.terminate(actor, "current-sid", "current-sid", true);

        assertThat(directory.terminated).containsExactly("current-sid");
        verify(audit).record(eq("jane.doe"), eq("LOGOUT_SESSION"), eq("session:current-sid"),
                org.mockito.ArgumentMatchers.contains("current session terminated"));
    }

    @Test
    void logoutOthersTerminatesEveryOtherSessionAndKeepsCurrent() {
        directory.seed("current-sid", keycloakId);
        directory.seed("s2", keycloakId);
        directory.seed("s3", keycloakId);

        int terminated = service.terminateOthers(actor, "current-sid");

        assertThat(terminated).isEqualTo(2);
        assertThat(directory.terminated).containsExactlyInAnyOrder("s2", "s3");
        verify(audit).record(eq("jane.doe"), eq("LOGOUT_OTHERS"), eq("user:" + keycloakId),
                org.mockito.ArgumentMatchers.contains("correlationId="));
    }

    @Test
    void enrichCurrentPersistsParsedDeviceDetailForANewSession() {
        when(details.findById("sid1")).thenReturn(Optional.empty());

        service.enrichCurrent(actor, "sid1", CHROME_UA, true);

        ArgumentCaptor<SessionDetail> saved = ArgumentCaptor.forClass(SessionDetail.class);
        verify(details).save(saved.capture());
        SessionDetail detail = saved.getValue();
        assertThat(detail.getSessionId()).isEqualTo("sid1");
        assertThat(detail.getKeycloakId()).isEqualTo(keycloakId);
        assertThat(detail.getBrowser()).isEqualTo("Chrome");
        assertThat(detail.getOperatingSystem()).isEqualTo("Windows");
        assertThat(detail.isMfaUsed()).isTrue();
        assertThat(detail.getUserAgent()).isEqualTo(CHROME_UA);
    }

    @Test
    void enrichCurrentRefreshesAnExistingSessionDetail() {
        SessionDetail existing = new SessionDetail("sid1", keycloakId, "Firefox", "Linux",
                "Desktop", "old-ua", false);
        when(details.findById("sid1")).thenReturn(Optional.of(existing));

        service.enrichCurrent(actor, "sid1", CHROME_UA, true);

        assertThat(existing.getBrowser()).isEqualTo("Chrome");
        assertThat(existing.isMfaUsed()).isTrue();
        verify(details).save(existing);
    }

    @Test
    void enrichCurrentIsANoOpWhenTheTokenCarriesNoSessionId() {
        service.enrichCurrent(actor, null, CHROME_UA, true);
        service.enrichCurrent(actor, "  ", CHROME_UA, true);

        verifyNoInteractions(details);
    }
}
