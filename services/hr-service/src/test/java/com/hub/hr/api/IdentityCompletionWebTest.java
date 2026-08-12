package com.hub.hr.api;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.hub.hr.application.ProvisioningService;
import com.hub.hr.application.SecurityAdminService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The identity lifecycle completed end to end through the API: the employee →
 * Keycloak link, the Keycloak-native activation flow, reactivation, MFA
 * enrolment, and the cross-context events the outbox has to carry.
 *
 * These are the behaviours the four gaps were about, so they are asserted at the
 * HTTP boundary an operator and the SPA actually use — not only at the service.
 */
class IdentityCompletionWebTest extends IdentityWebTestSupport {

    // ---------- Gap 4: the employee ↔ Keycloak link ----------

    @Test
    void provisioningLinksTheAccountAndTheLinkIsReadable() throws Exception {
        UUID id = seedEmployee("ACTIVE", null);

        mockMvc.perform(get("/api/hr/admin/employees/" + id + "/identity").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linked").value(false))
                .andExpect(jsonPath("$.provisioningStatus").value("NOT_PROVISIONED"));

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/provision").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linked").value(true))
                .andExpect(jsonPath("$.keycloakId").isNotEmpty());

        // The link is now readable without running another action — the state the
        // Identity page renders comes from here, not from a cached action result.
        mockMvc.perform(get("/api/hr/admin/employees/" + id + "/identity").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linked").value(true))
                .andExpect(jsonPath("$.provisioningStatus").value("PROVISIONED"))
                .andExpect(jsonPath("$.employeeStatus").value("ACTIVE"))
                .andExpect(jsonPath("$.provisionedAt").isNotEmpty());
    }

    @Test
    void theKeycloakIdIsPersistedOnTheEmployeeRow() throws Exception {
        UUID id = seedEmployee("ACTIVE", null);

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/provision").with(asRoles("HR")))
                .andExpect(status().isOk());

        // Read the column directly: the whole point of the link is that the row
        // carries it, so that `sub` resolves to this employee on every later request.
        flushPendingWrites();
        Map<String, Object> row = jdbc.queryForMap(
                "select keycloak_id, provisioning_status, provisioned_at from hr.employee where id = ?", id);
        assertThat(row.get("keycloak_id")).isNotNull();
        assertThat(row.get("provisioning_status")).isEqualTo("PROVISIONED");
        assertThat(row.get("provisioned_at")).isNotNull();
    }

    @Test
    void provisioningTwiceIsIdempotentAndCreatesNoSecondAccount() throws Exception {
        UUID id = seedEmployee("ACTIVE", null);

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/provision").with(asRoles("HR")))
                .andExpect(status().isOk());
        String first = keycloakIdOf(id);

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/provision").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.keycloakId").value(first));

        assertThat(identity.created).hasSize(1);
        assertThat(keycloakIdOf(id)).isEqualTo(first);
    }

    @Test
    void anAccountThatAlreadyExistsInKeycloakIsAdoptedNotDuplicated() throws Exception {
        UUID id = seedEmployee("ACTIVE", null);
        String email = jdbc.queryForObject("select email from hr.employee where id = ?", String.class, id);
        UUID existing = identity.givenExistingAccount(email, "EMPLOYEE");

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/provision").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.keycloakId").value(existing.toString()));

        // No second Keycloak user: a duplicate username is refused by Keycloak
        // anyway, and the retry would fail forever if we did not adopt.
        assertThat(identity.created).isEmpty();
        assertThat(keycloakIdOf(id)).isEqualTo(existing.toString());
        // The existing credential is left alone: no forced password change, no
        // activation mail. A pre-seeded account keeps working after adoption.
        assertThat(identity.requiredActions).isEmpty();
        assertThat(identity.actionEmails).isEmpty();
        flushPendingWrites();
        // Recorded as LINKED, not PROVISIONED — the history must not claim we
        // created an account that was already there.
        mockMvc.perform(get("/api/hr/admin/employees/" + id + "/provisioning").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("LINKED"));
    }

    /*
     * The "account already claimed by another employee" refusal is asserted in
     * ProvisioningServiceTest, not here. Its failure path writes the FAILED
     * journal row in a REQUIRES_NEW transaction — deliberately, so the failure
     * survives the caller's rollback — and a transactional web test holds the
     * employee row uncommitted, so that independent transaction cannot see it
     * and trips the provisioning_record foreign key. The refusal itself is real;
     * only this test harness cannot host it.
     */

    // ---------- Gap 5: Keycloak-native activation, no password anywhere ----------

    @Test
    void provisioningCreatesNoCredentialAndAsksKeycloakToEmailThePasswordSetup() throws Exception {
        UUID id = seedEmployee("ACTIVE", null);

        String body = mockMvc.perform(post("/api/hr/admin/employees/" + id + "/provision")
                        .with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activationEmailSent").value(true))
                .andReturn().getResponse().getContentAsString();

        // The account is created with no credential at all…
        assertThat(identity.created).hasSize(1);
        assertThat(identity.created.get(0).hasCredential()).isFalse();
        assertThat(identity.created.get(0).temporaryPassword()).isNull();
        // …with the required action that forces setup…
        assertThat(identity.requiredActions).contains(ProvisioningService.UPDATE_PASSWORD);
        // …and Keycloak is asked to e-mail the action token.
        assertThat(identity.actionEmails).containsExactly(List.of(ProvisioningService.UPDATE_PASSWORD));
        // Nothing password-shaped is in the response body.
        assertThat(body).doesNotContainIgnoringCase("password\":\"");
        assertThat(body).doesNotContainIgnoringCase("temporaryPassword");
    }

    @Test
    void anUndeliverableActivationEmailIsReportedButDoesNotUndoTheAccount() throws Exception {
        identity.failOnActionEmail = true;         // SMTP down / unconfigured
        UUID id = seedEmployee("ACTIVE", null);

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/provision").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.provisioningStatus").value("PROVISIONED"))
                .andExpect(jsonPath("$.activationEmailSent").value(false));

        // The account stands, the required action stands, nothing was rolled back.
        assertThat(identity.created).hasSize(1);
        assertThat(identity.deleted).isEmpty();
        assertThat(keycloakIdOf(id)).isNotNull();
    }

    @Test
    void resetPasswordInvalidatesTheCredentialAndReturnsNoPassword() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());

        String body = mockMvc.perform(post("/api/hr/admin/employees/" + id + "/reset-password")
                        .with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activationEmailSent").value(true))
                .andReturn().getResponse().getContentAsString();

        // The old password stops working (credential overwritten with a value
        // nobody keeps), setup is forced, and Keycloak sends the link.
        assertThat(identity.passwordResets).hasSize(1);
        assertThat(identity.requiredActions).contains(ProvisioningService.UPDATE_PASSWORD);
        assertThat(identity.actionEmails).containsExactly(List.of(ProvisioningService.UPDATE_PASSWORD));
        assertThat(body).doesNotContainIgnoringCase("password\":\"");
    }

    @Test
    void noPasswordEverReachesTheProvisioningHistoryOrTheSecurityTrail() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/reset-password").with(asRoles("HR")))
                .andExpect(status().isOk());

        // Every append-only trail the reset writes, read back as the auditor sees it.
        flushPendingWrites();
        for (String detail : jdbc.queryForList(
                "select detail from hr.provisioning_record where employee_id = ?", String.class, id)) {
            assertThat(detail).doesNotContainIgnoringCase("password=");
        }
        for (String detail : jdbc.queryForList(
                "select detail from hr.security_event", String.class)) {
            assertThat(detail).doesNotContainIgnoringCase("password=");
        }
        for (String detail : jdbc.queryForList(
                "select details from hr.audit_log", String.class)) {
            assertThat(detail).doesNotContainIgnoringCase("password=");
        }
    }

    @Test
    void mfaEnrolmentIsRequiredThroughKeycloaksOwnRequiredAction() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/require-mfa").with(asRoles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activationEmailSent").value(true));

        assertThat(identity.requiredActions).contains(SecurityAdminService.CONFIGURE_TOTP);
        assertThat(identity.actionEmails).containsExactly(List.of(SecurityAdminService.CONFIGURE_TOTP));
        // Recorded as a security event, per the IAM audit requirement.
        flushPendingWrites();
        assertThat(jdbc.queryForList("select type from hr.security_event", String.class))
                .contains("MFA_ENABLED");
    }

    @Test
    void requireMfaNeedsALinkedAccountLikeEveryOtherAccountAction() throws Exception {
        UUID id = seedEmployee("ACTIVE", null);
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/require-mfa").with(asRoles("ADMIN")))
                .andExpect(status().isConflict());
    }

    // ---------- Account security: the operations stay distinct ----------

    @Test
    void deactivateThenReactivateIsAReversibleRoundTrip() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/disable").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employeeStatus").value("DISABLED"))
                .andExpect(jsonPath("$.provisioningStatus").value("DISABLED"));
        assertThat(identity.disabled).isNotEmpty();
        assertThat(identity.loggedOut).isNotEmpty();       // sessions revoked

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/reactivate").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employeeStatus").value("ACTIVE"))
                .andExpect(jsonPath("$.provisioningStatus").value("PROVISIONED"));
        assertThat(identity.enabled).isNotEmpty();
        assertThat(identity.bruteForceCleared).isNotEmpty();
    }

    @Test
    void aTerminatedEmployeeCannotBeReactivated() throws Exception {
        UUID id = seedEmployee("TERMINATED", UUID.randomUUID());

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/reactivate").with(asRoles("ADMIN")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Illegal state transition"));

        // Offboarding is terminal: the account must not have been re-enabled.
        assertThat(identity.enabled).isEmpty();
        assertThat(jdbc.queryForObject("select status from hr.employee where id = ?", String.class, id))
                .isEqualTo("TERMINATED");
    }

    @Test
    void unlockClearsTheLockoutButLeavesADisabledEmployeeUnableToSignIn() throws Exception {
        UUID id = seedEmployee("DISABLED", UUID.randomUUID());

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/unlock").with(asRoles("HR")))
                .andExpect(status().isOk());

        // The brute-force lockout is cleared (the two locks are different things)…
        assertThat(identity.bruteForceCleared).isNotEmpty();
        // …but the account is NOT re-enabled while employment says DISABLED.
        assertThat(identity.enabled).isEmpty();
    }

    @Test
    void revokingSessionsLeavesTheAccountEnabled() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/revoke-sessions").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.provisioningStatus").value("PROVISIONED"));

        assertThat(identity.loggedOut).isNotEmpty();
        assertThat(identity.disabled).isEmpty();   // revoke ≠ disable
    }

    @Test
    void roleSyncRevokesAManagerRoleThatTheOrgChartNoLongerJustifies() throws Exception {
        UUID keycloakId = UUID.randomUUID();
        UUID id = seedEmployee("ACTIVE", keycloakId);
        // The account still carries MANAGER from when they had reports.
        identity.rolesByAccount.put(keycloakId,
                java.util.concurrent.ConcurrentHashMap.newKeySet());
        identity.rolesByAccount.get(keycloakId).add("MANAGER");

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/sync-roles").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.realmRole").value("EMPLOYEE"));

        // Synchronization is a REPLACEMENT: granting EMPLOYEE while leaving
        // MANAGER in place would keep every approval capability alive.
        assertThat(identity.assignedRoles).contains("EMPLOYEE");
        assertThat(identity.revokedRoles).contains("MANAGER");
        assertThat(identity.realmRolesOf(keycloakId)).containsExactly("EMPLOYEE");
    }

    @Test
    void roleSyncKeepsManagerForSomebodyWhoStillHasReports() throws Exception {
        UUID managerKeycloakId = UUID.randomUUID();
        UUID managerId = seedEmployee("EMP-MGR", "Mark", "Manager", "ACTIVE", managerKeycloakId, null);
        seedEmployee("EMP-RPT", "Rita", "Report", "ACTIVE", UUID.randomUUID(), managerId);

        mockMvc.perform(post("/api/hr/admin/employees/" + managerId + "/sync-roles").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.realmRole").value("MANAGER"));

        assertThat(identity.revokedRoles).doesNotContain("MANAGER");
    }

    @Test
    void anIdentityActionNeverStripsADeliberatelyAssignedHrRole() throws Exception {
        UUID keycloakId = UUID.randomUUID();
        UUID id = seedEmployee("ACTIVE", keycloakId);
        identity.rolesByAccount.put(keycloakId,
                java.util.concurrent.ConcurrentHashMap.newKeySet());
        identity.rolesByAccount.get(keycloakId).addAll(List.of("MANAGER", "HR"));

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/sync-roles").with(asRoles("ADMIN")))
                .andExpect(status().isOk());

        // MANAGER is derived and goes; HR is granted deliberately by an
        // administrator and a reporting-line change must never revoke it.
        assertThat(identity.revokedRoles).containsExactly("MANAGER");
        assertThat(identity.realmRolesOf(keycloakId)).contains("HR");
    }

    // ---------- Gap 3: the cross-context events reach the outbox ----------

    @Test
    void deactivationAndReactivationEachWriteTheirOwnOutboxEvent() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/disable").with(asRoles("HR")))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/reactivate").with(asRoles("HR")))
                .andExpect(status().isOk());

        flushPendingWrites();
        List<String> types = jdbc.queryForList(
                "select type from hr.event_outbox where aggregate_id = ? order by created_at", String.class, id);
        assertThat(types).containsSubsequence("employee.deactivated", "employee.reactivated");
    }

    @Test
    void provisioningAndOffboardingWriteTheirEventsInTheSameTransactionAsTheStateChange()
            throws Exception {
        UUID id = seedEmployee("ACTIVE", null);

        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/provision").with(asRoles("HR")))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/offboard").with(asRoles("ADMIN")))
                .andExpect(status().isOk());

        flushPendingWrites();
        List<Map<String, Object>> events = jdbc.queryForList(
                "select type, correlation_id, published_at from hr.event_outbox "
                        + "where aggregate_id = ? order by created_at", id);
        assertThat(events).extracting(row -> row.get("type"))
                .containsSubsequence("employee.provisioned", "employee.offboarded");
        // Unpublished: the relay is off in tests, and the outbox — not the broker —
        // is the source of truth. Every event carries a correlation id.
        assertThat(events).allSatisfy(row -> {
            assertThat(row.get("published_at")).isNull();
            assertThat(row.get("correlation_id")).isNotNull();
        });
    }

    @Test
    void anOutboxEventCarriesTheKeycloakIdDownstreamConsumersKeyOn() throws Exception {
        UUID id = seedEmployee("ACTIVE", null);
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/provision").with(asRoles("HR")))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/offboard").with(asRoles("ADMIN")))
                .andExpect(status().isOk());

        flushPendingWrites();
        String payload = jdbc.queryForObject(
                "select payload from hr.event_outbox where aggregate_id = ? and type = 'employee.offboarded'",
                String.class, id);
        Map<?, ?> event = objectMapper.readValue(payload, Map.class);
        // leave/expense/documents resolve ownership by keycloakId, never employeeId.
        assertThat(event.get("keycloakId")).isEqualTo(keycloakIdOf(id));
        assertThat(event.get("eventId")).isNotNull();
        assertThat(event.get("aggregateId")).isEqualTo(id.toString());
        assertThat(event.get("occurredAt")).isNotNull();
    }

    // ---------- RBAC on the new endpoints ----------

    @Test
    void theNewIdentityEndpointsAreClosedToEmployeesAndManagers() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        for (String role : List.of("EMPLOYEE", "MANAGER")) {
            mockMvc.perform(get("/api/hr/admin/employees/" + id + "/identity").with(asRoles(role)))
                    .andExpect(status().isForbidden());
            mockMvc.perform(post("/api/hr/admin/employees/" + id + "/reactivate").with(asRoles(role)))
                    .andExpect(status().isForbidden());
            mockMvc.perform(post("/api/hr/admin/employees/" + id + "/require-mfa").with(asRoles(role)))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void theIdentityStateReadIsJsonAndNamesBothStates() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(get("/api/hr/admin/employees/" + id + "/identity").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(jsonPath("$.employeeStatus").value("ACTIVE"))
                .andExpect(jsonPath("$.provisioningStatus").value("PROVISIONED"))
                .andExpect(jsonPath("$.activationEmailSent").doesNotExist());
    }

    private String keycloakIdOf(UUID employeeId) {
        Object value = jdbc.queryForObject(
                "select keycloak_id from hr.employee where id = ?", Object.class, employeeId);
        return value == null ? null : value.toString();
    }
}
