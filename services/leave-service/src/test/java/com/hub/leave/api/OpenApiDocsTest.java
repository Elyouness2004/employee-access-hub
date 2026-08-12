package com.hub.leave.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The generated OpenAPI document is reachable without a token and covers the leave API. */
@SpringBootTest(properties = {
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks"
})
@AutoConfigureMockMvc
class OpenApiDocsTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void apiDocsArePublicAndDescribeLeaveEndpoints() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.info.title").value("Leave Service API"))
                .andExpect(jsonPath("$.paths['/api/leave/requests']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/leave/requests/{id}/approve']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/leave/balances/my']", notNullValue()))
                .andExpect(jsonPath("$.components.securitySchemes['bearer-jwt']", notNullValue()));
    }
}
