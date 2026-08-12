package com.hub.hr.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hub.hr.config.KeycloakRealmRoleConverter;
import com.hub.hr.support.IdentityTestConfig;
import com.hub.hr.support.RecordingIdentityProvisioner;
import com.hub.hr.support.RecordingOffboardingNotifier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

/**
 * Shared fixture for identity web tests: full context on H2/Flyway with the
 * recording identity/notifier fakes, MockMvc with Keycloak-shaped tokens run
 * through the production role converter, and rows seeded via JDBC (identity
 * onboarding owns keycloak_id, so the CRUD API cannot set it). Transactional:
 * each test rolls back, and AFTER_COMMIT auto-onboarding does not fire.
 */
@SpringBootTest(properties = {
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks"
})
@AutoConfigureMockMvc
@Import(IdentityTestConfig.class)
@Transactional
abstract class IdentityWebTestSupport {

    @Autowired protected MockMvc mockMvc;
    @Autowired protected ObjectMapper objectMapper;
    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected RecordingIdentityProvisioner identity;
    @Autowired protected RecordingOffboardingNotifier notifier;
    @jakarta.persistence.PersistenceContext protected jakarta.persistence.EntityManager entityManager;

    /**
     * Push pending JPA inserts to the database so a raw SQL assertion can see
     * them.
     *
     * <p>Needed because these tests share one uncommitted transaction with the
     * request, and Hibernate's automatic flush only fires when a JPA query
     * touches the same tables as the pending writes. Reading an {@code employee}
     * does not flush a queued {@code event_outbox} or {@code security_event} row,
     * so a JdbcTemplate query for one can otherwise find nothing and the test
     * reports "no event was written" when the code wrote it correctly.
     */
    protected void flushPendingWrites() {
        entityManager.flush();
    }

    private UUID departmentId;
    private UUID positionId;

    @org.junit.jupiter.api.BeforeEach
    void resetRecordingFakes() {
        identity.reset();
        notifier.notifiedFor.clear();
    }

    protected UUID departmentId() {
        if (departmentId == null) {
            departmentId = UUID.randomUUID();
            Instant now = Instant.now();
            jdbc.update("insert into hr.department (id, name, description, created_at, updated_at) "
                    + "values (?, ?, ?, ?, ?)", departmentId, "Engineering", null, now, now);
        }
        return departmentId;
    }

    protected UUID positionId() {
        if (positionId == null) {
            positionId = UUID.randomUUID();
            Instant now = Instant.now();
            jdbc.update("insert into hr.position (id, title, description, created_at, updated_at) "
                    + "values (?, ?, ?, ?, ?)", positionId, "Engineer", null, now, now);
        }
        return positionId;
    }

    /** Seed an employee; when {@code keycloakId} is non-null it is a provisioned account. */
    protected UUID seedEmployee(String status, UUID keycloakId) {
        UUID id = UUID.randomUUID();
        return seedEmployee("EMP-" + Math.abs(id.hashCode()), "Jane", "Doe", status, keycloakId, null, id);
    }

    /** Seed an employee with explicit identity fields — for directory, profile and team views. */
    protected UUID seedEmployee(String matricule, String firstName, String lastName, String status,
                                UUID keycloakId, UUID managerId) {
        return seedEmployee(matricule, firstName, lastName, status, keycloakId, managerId, UUID.randomUUID());
    }

    private UUID seedEmployee(String matricule, String firstName, String lastName, String status,
                              UUID keycloakId, UUID managerId, UUID id) {
        Instant now = Instant.now();
        jdbc.update("insert into hr.employee (id, keycloak_id, provisioning_status, matricule, first_name, "
                        + "last_name, email, hire_date, status, manager_id, department_id, position_id, "
                        + "created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, keycloakId, keycloakId == null ? "NOT_PROVISIONED" : "PROVISIONED",
                matricule, firstName, lastName,
                (firstName + "." + lastName + "." + Math.abs(id.hashCode()) + "@corp.test").toLowerCase(),
                LocalDate.of(2024, 1, 8), status, managerId, departmentId(), positionId(), now, now);
        return id;
    }

    protected static RequestPostProcessor asRoles(String... roles) {
        return asSubject(UUID.randomUUID(), "admin.user", roles);
    }

    /** A token for a specific Keycloak subject — what the self-service endpoints resolve on. */
    protected static RequestPostProcessor asSubject(UUID subject, String username, String... roles) {
        Jwt token = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(subject.toString())
                .issuer("http://test-issuer/realms/employee-hub")
                .audience(List.of("hub-api"))
                .claim("preferred_username", username)
                .claim("realm_access", Map.of("roles", List.of(roles)))
                .build();
        return jwt().jwt(token).authorities(new KeycloakRealmRoleConverter());
    }
}
