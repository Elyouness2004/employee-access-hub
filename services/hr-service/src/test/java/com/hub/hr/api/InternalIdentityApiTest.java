package com.hub.hr.api;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Internal identity APIs (Part 5): provisioning status/history, identity links and
 * the event trail. Not routed by the gateway; HR/Admin token required, others 403,
 * anonymous 401.
 */
class InternalIdentityApiTest extends IdentityWebTestSupport {

    @Test
    void provisioningStatusIsReadableByHr() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(get("/internal/provisioning/" + id).with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employeeId").value(id.toString()))
                .andExpect(jsonPath("$.provisioningStatus").value("PROVISIONED"));
    }

    @Test
    void identityLinksListProvisionedEmployees() throws Exception {
        UUID provisioned = seedEmployee("ACTIVE", UUID.randomUUID());
        seedEmployee("ACTIVE", null); // not provisioned → excluded
        mockMvc.perform(get("/internal/users").with(asRoles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.employeeId=='" + provisioned + "')]").exists());
    }

    @Test
    void eventTrailIsReadableByHr() throws Exception {
        mockMvc.perform(get("/internal/events").with(asRoles("HR")))
                .andExpect(status().isOk());
    }

    @Test
    void internalProvisioningRejectsPlainEmployees() throws Exception {
        UUID id = seedEmployee("ACTIVE", UUID.randomUUID());
        mockMvc.perform(get("/internal/provisioning/" + id).with(asRoles("EMPLOYEE")))
                .andExpect(status().isForbidden());
    }

    @Test
    void provisioningStatusForAnUnknownEmployeeIs404() throws Exception {
        mockMvc.perform(get("/internal/provisioning/" + UUID.randomUUID()).with(asRoles("HR")))
                .andExpect(status().isNotFound());
    }

    @Test
    void internalUsersRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/internal/users"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void internalEventsRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/internal/events"))
                .andExpect(status().isUnauthorized());
    }
}
