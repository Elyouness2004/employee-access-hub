package com.hub.documents.api;

import java.util.UUID;

import com.hub.documents.application.Actor;
import com.hub.documents.domain.AccessRole;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

/** Maps the validated JWT to the application-layer {@link Actor}. */
final class Actors {

    private Actors() {
    }

    static Actor from(Jwt jwt, Authentication authentication) {
        return new Actor(UUID.fromString(jwt.getSubject()),
                jwt.getClaimAsString("preferred_username"),
                highestRole(authentication));
    }

    /** The caller's most privileged role — the one the category role gate uses. */
    private static AccessRole highestRole(Authentication authentication) {
        AccessRole highest = AccessRole.EMPLOYEE;
        for (GrantedAuthority authority : authentication.getAuthorities()) {
            AccessRole role = switch (authority.getAuthority()) {
                case "ROLE_ADMIN" -> AccessRole.ADMIN;
                case "ROLE_HR" -> AccessRole.HR;
                case "ROLE_MANAGER" -> AccessRole.MANAGER;
                case "ROLE_EMPLOYEE" -> AccessRole.EMPLOYEE;
                default -> null;
            };
            if (role != null && role.satisfies(highest)) {
                highest = role;
            }
        }
        return highest;
    }
}
