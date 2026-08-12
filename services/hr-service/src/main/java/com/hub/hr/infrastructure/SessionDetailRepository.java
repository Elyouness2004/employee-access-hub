package com.hub.hr.infrastructure;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Local session-detail store (Part 8), keyed by Keycloak session id. Inherited
 * {@code findById}/{@code findAllById}/{@code deleteById} cover the read, merge
 * and cleanup paths; the finder below reads all details for one account.
 */
public interface SessionDetailRepository extends JpaRepository<SessionDetail, String> {

    List<SessionDetail> findAllBySessionIdIn(Collection<String> sessionIds);
}
