package com.hub.hr.config;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

import static org.assertj.core.api.Assertions.assertThat;

class KeycloakRealmRoleConverterTest {

    private final KeycloakRealmRoleConverter converter = new KeycloakRealmRoleConverter();

    private static Jwt jwtWithClaims(Map<String, Object> extraClaims) {
        Jwt.Builder builder = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .subject("subject");
        extraClaims.forEach(builder::claim);
        return builder.build();
    }

    @Test
    void mapsRealmRolesToRolePrefixedAuthorities() {
        Jwt jwt = jwtWithClaims(Map.of("realm_access", Map.of("roles", List.of("MANAGER", "EMPLOYEE"))));

        Collection<GrantedAuthority> authorities = converter.convert(jwt);

        assertThat(authorities)
                .extracting(GrantedAuthority::getAuthority)
                .containsExactlyInAnyOrder("ROLE_MANAGER", "ROLE_EMPLOYEE");
    }

    @Test
    void missingRealmAccessYieldsNoAuthorities() {
        Jwt jwt = jwtWithClaims(Map.of("preferred_username", "someone"));

        assertThat(converter.convert(jwt)).isEmpty();
    }

    @Test
    void malformedRolesEntryYieldsNoAuthorities() {
        Jwt jwt = jwtWithClaims(Map.of("realm_access", Map.of("roles", "not-a-list")));

        assertThat(converter.convert(jwt)).isEmpty();
    }
}
