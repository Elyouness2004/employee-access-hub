package com.hub.hr.infrastructure;

import java.security.SecureRandom;
import java.util.Base64;

import com.hub.hr.application.PasswordGenerator;
import org.springframework.stereotype.Component;

/**
 * 24-byte cryptographically-random temporary password, URL-safe base64 encoded.
 * Comfortably above any reasonable Keycloak password policy; used once then
 * forcibly rotated on first login.
 */
@Component
public class SecureRandomPasswordGenerator implements PasswordGenerator {

    private final SecureRandom random = new SecureRandom();

    @Override
    public String generateTemporary() {
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        return "Aa1!" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
