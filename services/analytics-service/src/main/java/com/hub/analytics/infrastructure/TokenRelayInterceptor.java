package com.hub.analytics.infrastructure;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * OAuth2 token relay (§2.5): the caller's own HR/Admin JWT travels to each
 * source's internal stats API, which re-validates it (zero trust) — no service
 * account, no password.
 */
@Component
public class TokenRelayInterceptor implements RequestInterceptor {

    @Override
    public void apply(RequestTemplate template) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken jwtAuthentication) {
            template.header("Authorization", "Bearer " + jwtAuthentication.getToken().getTokenValue());
        }
    }
}
