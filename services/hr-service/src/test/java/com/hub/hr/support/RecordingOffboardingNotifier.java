package com.hub.hr.support;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import com.hub.hr.application.OffboardingNotifier;

/** Test double for the offboarding fan-out: records who would be notified. */
public class RecordingOffboardingNotifier implements OffboardingNotifier {

    public final List<UUID> notifiedFor = new CopyOnWriteArrayList<>();
    public volatile List<String> notified = List.of("leave", "expense", "documents");
    public volatile List<String> failed = List.of();

    @Override
    public OffboardingFanout notifyDownstream(UUID employeeKeycloakId) {
        notifiedFor.add(employeeKeycloakId);
        return new OffboardingFanout(notified, failed);
    }
}
