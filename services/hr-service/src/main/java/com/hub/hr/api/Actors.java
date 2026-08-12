package com.hub.hr.api;

import java.util.UUID;

import com.hub.hr.application.Actor;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;

/** Maps the validated JWT to the application-layer {@link Actor} (mirrors leave/expense). */
final class Actors {

    private Actors() {
    }

    static Actor from(Jwt jwt, Authentication authentication) {
        boolean hrOrAdmin = authentication.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_HR")
                        || authority.getAuthority().equals("ROLE_ADMIN"));
        return new Actor(UUID.fromString(jwt.getSubject()),
                jwt.getClaimAsString("preferred_username"), hrOrAdmin);
    }
}
