package com.hub.analytics.config;

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
    OpenAPI analyticsServiceOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Analytics Service API")
                        .version("v1")
                        .description("""
                                Analytics bounded context: a READ-ONLY aggregator over the \
                                secured internal REST APIs of hr/leave/expense/documents. It holds \
                                no database. Every source call is wrapped in a Resilience4j circuit \
                                breaker with timeouts and a snapshot cache, so an outage degrades \
                                to a stale/empty section instead of failing. All reporting and \
                                Power BI endpoints require an HR/Admin Keycloak bearer token \
                                (audience hub-api)."""))
                .components(new Components().addSecuritySchemes("bearer-jwt",
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList("bearer-jwt"));
    }
}
