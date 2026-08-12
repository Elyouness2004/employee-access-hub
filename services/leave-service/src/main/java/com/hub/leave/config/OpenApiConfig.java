package com.hub.leave.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI leaveServiceOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Leave Service API")
                        .version("v1")
                        .description("""
                                Leave bounded context: requests, approvals and balances.
                                Enforces BR-01 (balance), BR-02 (no self-approval, HR \
                                escalation) and BR-03 (no overlap with approved leave). \
                                All business endpoints require a Keycloak bearer token \
                                (audience hub-api); approvals additionally require the \
                                caller to be the request's direct manager."""))
                .components(new Components().addSecuritySchemes("bearer-jwt",
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList("bearer-jwt"));
    }
}
