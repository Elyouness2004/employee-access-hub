package com.hub.hr.domain.identity;

/**
 * The identity provider could not deliver an account action e-mail (password
 * setup, MFA enrolment) — SMTP is unconfigured, unreachable, or rejected the
 * message.
 *
 * <p>Deliberately NOT an {@link IdentityUnavailableException}: the provider was
 * reached and the account operation itself succeeded. Only the notification
 * failed, which is a partial outcome the operator must be told about — the
 * required action is still set on the account, so the employee can complete it
 * through Keycloak's own "forgot password" flow or a re-sent activation. Failing
 * the whole provisioning here would roll back a perfectly good account because
 * a mail server was down.
 */
public class ActivationDeliveryException extends RuntimeException {

    public ActivationDeliveryException(String message, Throwable cause) {
        super(message, cause);
    }

    public ActivationDeliveryException(String message) {
        super(message);
    }
}
