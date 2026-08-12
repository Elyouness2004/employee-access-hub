package com.hub.gateway.security;

import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.security.oauth2.resource.OAuth2ResourceServerProperties;
import org.springframework.cloud.gateway.config.GlobalCorsProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

/**
 * First defense line (layer 1): no request reaches a business service without a
 * structurally valid, correctly signed, unexpired JWT for the right issuer and
 * audience. Role decisions are NOT made here — services own RBAC (zero trust,
 * the Bearer token is relayed downstream for re-validation).
 */
@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    @Bean
    SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http,
                                                 CorsConfigurationSource corsConfigurationSource) {
        http
            // CORS must run INSIDE this chain (SecurityWebFiltersOrder.CORS, i.e.
            // before AUTHENTICATION/AUTHORIZATION). Spring Cloud Gateway's own
            // `globalcors` support lives on RoutePredicateHandlerMapping, which the
            // DispatcherHandler only reaches AFTER this chain has run — so without
            // this line an unauthenticated preflight (OPTIONS carries no
            // Authorization header, by design) is rejected 401 by the authorization
            // filter and never gets an Access-Control-Allow-Origin, making every
            // cross-origin browser call fail. Two things follow from putting it here:
            //   1. CorsWebFilter answers preflights itself and short-circuits, so
            //      preflight needs no authentication while a bare (non-preflight)
            //      OPTIONS still requires a valid JWT — nothing is made public.
            //   2. This chain's OWN error responses carry the CORS headers too, so a
            //      browser can actually READ a 401 instead of seeing an opaque
            //      network error. The SPA's 401 renew-and-replay depends on that.
            .cors(cors -> cors.configurationSource(corsConfigurationSource))
            .csrf(ServerHttpSecurity.CsrfSpec::disable)
            .authorizeExchange(exchanges -> exchanges
                .pathMatchers("/actuator/health", "/actuator/health/**",
                              "/actuator/prometheus", "/actuator/info").permitAll()
                .anyExchange().authenticated())
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()));
        return http.build();
    }

    /**
     * The ONE CORS policy, adapted — not duplicated — from the gateway's own
     * {@code spring.cloud.gateway.server.webflux.globalcors} configuration. The
     * allowed origins/methods/headers stay declared in YAML (env-driven, so the
     * staging and production profiles pin real origins via
     * {@code HUB_CORS_ALLOWED_ORIGINS}); this bean only makes that same
     * configuration visible to the security chain above. Sharing one source means
     * the two places CORS is evaluated — this chain and the gateway handler
     * mapping — cannot drift apart, and Spring's CorsProcessor skips a response
     * that already carries Access-Control-Allow-Origin, so headers are never
     * emitted twice.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource(GlobalCorsProperties globalCorsProperties) {
        if (globalCorsProperties.getCorsConfigurations().isEmpty()) {
            // Fail fast at startup rather than shipping a gateway that answers every
            // browser preflight without CORS headers — a failure that is invisible
            // server-side and only shows up as a blocked request in a console.
            throw new IllegalStateException(
                    "No CORS configuration found: set spring.cloud.gateway.server.webflux.globalcors"
                    + ".cors-configurations (HUB_CORS_ALLOWED_ORIGINS) — the browser SPA cannot "
                    + "call the gateway without it.");
        }
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.setCorsConfigurations(globalCorsProperties.getCorsConfigurations());
        return source;
    }

    /**
     * Same issuer/JWKS split as the services: with container networking the
     * token's issuer is the host-facing URL while keys are fetched internally.
     */
    @Bean
    ReactiveJwtDecoder reactiveJwtDecoder(OAuth2ResourceServerProperties properties,
                                          @Value("${hub.security.audience}") String audience) {
        OAuth2ResourceServerProperties.Jwt jwt = properties.getJwt();
        String jwkSetUri = jwt.getJwkSetUri();
        NimbusReactiveJwtDecoder decoder = (jwkSetUri != null && !jwkSetUri.isBlank())
                ? NimbusReactiveJwtDecoder.withJwkSetUri(jwkSetUri).build()
                : NimbusReactiveJwtDecoder.withIssuerLocation(jwt.getIssuerUri()).build();

        List<OAuth2TokenValidator<Jwt>> validators = new ArrayList<>();
        validators.add(new JwtTimestampValidator());
        if (jwt.getIssuerUri() != null && !jwt.getIssuerUri().isBlank()) {
            validators.add(new JwtIssuerValidator(jwt.getIssuerUri()));
        }
        validators.add(new JwtClaimValidator<List<String>>(JwtClaimNames.AUD,
                aud -> aud != null && aud.contains(audience)));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(validators));
        return decoder;
    }
}
