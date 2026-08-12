package com.hub.hr.api;

import java.util.Map;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Authentication milestone probes — NOT business endpoints. They exist to prove
 * the token pipeline end-to-end: authentication (401), coarse RBAC per role
 * (403/200) and claim propagation. Business HR endpoints arrive in Phase 2.
 */
@RestController
@RequestMapping("/api/hr/auth")
public class AuthProbeController {

    @GetMapping("/me")
    public Map<String, Object> me(@AuthenticationPrincipal Jwt jwt, Authentication authentication) {
        // LinkedHashMap: individual claims may be absent depending on client scopes
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("subject", jwt.getSubject());
        body.put("username", jwt.getClaimAsString("preferred_username"));
        body.put("issuer", String.valueOf(jwt.getIssuer()));
        body.put("audience", jwt.getAudience());
        body.put("authorities", authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .sorted()
                .toList());
        return body;
    }

    @GetMapping("/employee-check")
    @PreAuthorize("hasRole('EMPLOYEE')")
    public Map<String, String> employeeCheck() {
        return Map.of("access", "granted", "requires", "EMPLOYEE");
    }

    @GetMapping("/manager-check")
    @PreAuthorize("hasRole('MANAGER')")
    public Map<String, String> managerCheck() {
        return Map.of("access", "granted", "requires", "MANAGER");
    }

    @GetMapping("/hr-check")
    @PreAuthorize("hasRole('HR')")
    public Map<String, String> hrCheck() {
        return Map.of("access", "granted", "requires", "HR");
    }

    @GetMapping("/admin-check")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, String> adminCheck() {
        return Map.of("access", "granted", "requires", "ADMIN");
    }
}
