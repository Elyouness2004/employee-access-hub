package com.hub.hr.infrastructure;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {

    /** Relay drain order: oldest unpublished first. */
    List<OutboxEvent> findByPublishedAtIsNullOrderByCreatedAtAsc(Limit limit);

    List<OutboxEvent> findTop100ByOrderByCreatedAtDesc();

    long countByPublishedAtIsNull();
}
