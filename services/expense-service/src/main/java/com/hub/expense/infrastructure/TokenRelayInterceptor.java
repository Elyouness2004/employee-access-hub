package com.hub.expense.infrastructure;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * OAuth2 token relay (§2.5): the caller's own JWT travels to hr-service, so the
 * golden rule holds — no service account, no password, and hr-service
 * re-validates the same token (zero trust).
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
