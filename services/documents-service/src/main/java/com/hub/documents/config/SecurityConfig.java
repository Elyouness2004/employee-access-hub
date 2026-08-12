package com.hub.documents.config;

import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.security.oauth2.resource.OAuth2ResourceServerProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Zero-trust resource server (resource-server template, P2.1): the JWT is fully
 * re-validated here even though the gateway already validated it (defense in
 * depth, layer 2). Signature, timestamps, issuer and audience are all checked;
 * roles map to authorities for RBAC.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // error dispatch must not be swallowed by denyAll: a 500 would
                // otherwise surface as a misleading 403
                .dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ERROR).permitAll()
                .requestMatchers("/actuator/health", "/actuator/health/**",
                                 "/actuator/prometheus", "/actuator/info").permitAll()
                // API docs stay unauthenticated: the service lives on the internal
                // backend network only and the gateway does not route these paths
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                .requestMatchers("/api/**").authenticated()
                // service-to-service API (token relay): never routed by the
                // gateway, so only backend-network peers can reach it — the JWT
                // is still fully validated (zero trust)
                .requestMatchers("/internal/**").authenticated()
                .anyRequest().denyAll())
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));
        return http.build();
    }

    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(new KeycloakRealmRoleConverter());
        converter.setPrincipalClaimName("preferred_username");
        return converter;
    }

    /**
     * Decoder wiring supports the container split where tokens carry the public
     * issuer URL while JWKS is fetched over the internal network: if
     * {@code jwk-set-uri} is set it wins for key retrieval, and the configured
     * {@code issuer-uri} is still enforced as a claim validator.
     */
    @Bean
    JwtDecoder jwtDecoder(OAuth2ResourceServerProperties properties,
                          @Value("${hub.security.audience}") String audience) {
        OAuth2ResourceServerProperties.Jwt jwt = properties.getJwt();
        String jwkSetUri = jwt.getJwkSetUri();
        NimbusJwtDecoder decoder = (jwkSetUri != null && !jwkSetUri.isBlank())
                ? NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build()
                : NimbusJwtDecoder.withIssuerLocation(jwt.getIssuerUri()).build();

        List<OAuth2TokenValidator<Jwt>> validators = new ArrayList<>();
        validators.add(new JwtTimestampValidator());
        if (jwt.getIssuerUri() != null && !jwt.getIssuerUri().isBlank()) {
            validators.add(new JwtIssuerValidator(jwt.getIssuerUri()));
        }
        validators.add(audienceValidator(audience));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(validators));
        return decoder;
    }

    static OAuth2TokenValidator<Jwt> audienceValidator(String requiredAudience) {
        return new JwtClaimValidator<List<String>>(JwtClaimNames.AUD,
                aud -> aud != null && aud.contains(requiredAudience));
    }
}
