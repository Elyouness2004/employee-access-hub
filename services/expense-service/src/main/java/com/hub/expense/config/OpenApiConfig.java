package com.hub.expense.config;

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
    OpenAPI expenseServiceOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Expense Service API")
                        .version("v1")
                        .description("""
                                Expense bounded context: claims, approvals and a configurable \
                                second-level approval threshold. Enforces BR-01 (owner-only \
                                access), BR-02 (direct-manager approval, HR escalation), BR-03 \
                                (threshold → second-level approval), BR-04 (rejected is terminal) \
                                and BR-05 (every decision audited). All business endpoints require \
                                a Keycloak bearer token (audience hub-api)."""))
                .components(new Components().addSecuritySchemes("bearer-jwt",
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList("bearer-jwt"));
    }
}
