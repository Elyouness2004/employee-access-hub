package com.hub.documents.config;

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
    OpenAPI documentsServiceOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Documents Service API")
                        .version("v1")
                        .description("""
                                Documents bounded context: document metadata and categories. \
                                Access is category-role gated — sensitive categories (minRole \
                                HR/ADMIN) require HR or Admin — and every download is \
                                audit-logged (FR-41). All business endpoints require a Keycloak \
                                bearer token (audience hub-api)."""))
                .components(new Components().addSecuritySchemes("bearer-jwt",
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList("bearer-jwt"));
    }
}
