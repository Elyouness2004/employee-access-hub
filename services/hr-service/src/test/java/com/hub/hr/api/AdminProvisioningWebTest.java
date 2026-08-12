package com.hub.hr.api;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Admin identity-administration API (Part 7): RBAC (HR/Admin only), the manual
 * provisioning / offboarding / security operations, and the history reads.
 */
class AdminProvisioningWebTest extends IdentityWebTestSupport {

    @Test
    void provisionLinksTheAccountAndReportsStatus() throws Exception {
        UUID id = seedEmployee("ACTIVE", null);
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/provision").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.provisioningStatus").value("PROVISIONED"))
                .andExpect(jsonPath("$.keycloakId").isNotEmpty())
                .andExpect(jsonPath("$.realmRole").value("EMPLOYEE"));
        assertThat(identity.created).hasSize(1);
    }

    @Test
    void offboardDisablesAndReportsFanout() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/offboard").with(asRoles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.identityDisabled").value(true))
                .andExpect(jsonPath("$.notified", org.hamcrest.Matchers.hasItem("leave")));
    }

    @Test
    void resetPasswordRequiresAProvisionedAccount() throws Exception {
        UUID id = seedEmployee("ACTIVE", null);
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/reset-password").with(asRoles("HR")))
                .andExpect(status().isConflict());
    }

    @Test
    void resetPasswordOnAProvisionedAccountSucceeds() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/reset-password").with(asRoles("HR")))
                .andExpect(status().isOk());
        assertThat(identity.passwordResets).hasSize(1);
    }

    @Test
    void lockThenUnlockTogglesProvisioningState() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/lock").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.provisioningStatus").value("LOCKED"));
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/unlock").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.provisioningStatus").value("PROVISIONED"));
    }

    @Test
    void disableDeactivatesTheAccount() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/disable").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employeeStatus").value("DISABLED"));
        assertThat(identity.disabled).isNotEmpty();
    }

    @Test
    void syncRolesPushesTheDerivedRole() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/sync-roles").with(asRoles("HR")))
                .andExpect(status().isOk());
    }

    @Test
    void revokeSessionsKillsSessionsAndRefreshTokens() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/revoke-sessions").with(asRoles("ADMIN")))
                .andExpect(status().isOk());
        assertThat(identity.loggedOut).hasSize(1);
    }

    @Test
    void provisioningHistoryIsReadable() throws Exception {
        UUID id = seedEmployee("ACTIVE", null);
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/provision").with(asRoles("HR")))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/hr/admin/employees/" + id + "/provisioning").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("PROVISIONED"));
        mockMvc.perform(get("/api/hr/admin/provisioning").with(asRoles("HR")))
                .andExpect(status().isOk());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {
            "provision", "reprovision", "offboard", "reset-password", "disable",
            "lock", "unlock", "sync-roles", "revoke-sessions"})
    void everyAdminActionIsForbiddenForPlainEmployees(String action) throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/" + action).with(asRoles("EMPLOYEE")))
                .andExpect(status().isForbidden());
    }

    @Test
    void provisioningHistoryIsForbiddenForPlainEmployees() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(get("/api/hr/admin/employees/" + id + "/provisioning").with(asRoles("EMPLOYEE")))
                .andExpect(status().isForbidden());
    }

    @Test
    void unauthenticatedAdminAccessIsRejected() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(post("/api/hr/admin/employees/" + id + "/provision"))
                .andExpect(status().isUnauthorized());
    }
}
