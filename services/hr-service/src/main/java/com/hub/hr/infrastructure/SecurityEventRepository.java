package com.hub.hr.infrastructure;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SecurityEventRepository extends JpaRepository<SecurityEvent, UUID> {

    List<SecurityEvent> findAllByKeycloakIdOrderByOccurredAtAsc(UUID keycloakId);

    List<SecurityEvent> findTop100ByOrderByOccurredAtDesc();

    /** Bounded window scan backing the Audit Center "login attempts" statistics. */
    List<SecurityEvent> findByOccurredAtBetween(Instant from, Instant to);
}
