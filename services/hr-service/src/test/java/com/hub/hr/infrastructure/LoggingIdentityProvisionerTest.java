package com.hub.hr.infrastructure;

import java.util.List;
import java.util.UUID;

import com.hub.hr.domain.identity.ActivationDeliveryException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The no-Keycloak adapter, and the one thing it must NOT pretend to do.
 *
 * Sending an account e-mail needs a provider. When this adapter returned quietly
 * from {@code sendActionsEmail}, {@code SecurityAdminService.sendActions} read
 * that as delivery and the API answered {@code activationEmailSent=true} on a
 * stack with no mail server and no Keycloak — the admin UI then told an operator
 * an e-mail had gone out when the log line right beside it said
 * "no provider: nothing was sent".
 */
class LoggingIdentityProvisionerTest {

    private final LoggingIdentityProvisioner provisioner = new LoggingIdentityProvisioner();

    @Test
    void reportsThatNoEmailCanBeSentWithoutAProvider() {
        UUID account = provisioner.createUser(com.hub.hr.domain.identity.NewIdentity.withoutCredential(
                "amina.berrada@example.com", "amina.berrada@example.com", "Amina", "Berrada", "EMPLOYEE"));

        assertThatThrownBy(() -> provisioner.sendActionsEmail(account, List.of("UPDATE_PASSWORD")))
                .isInstanceOf(ActivationDeliveryException.class)
                .hasMessageContaining("no identity provider is configured")
                // The required action IS on the account; only delivery is missing.
                .hasMessageContaining("UPDATE_PASSWORD");
    }

    /**
     * Everything else still succeeds: the whole lifecycle has to run without a
     * Keycloak, which is the reason this adapter exists. Only delivery is refused.
     */
    @Test
    void keepsEveryAccountMutationWorkingWithoutAProvider() {
        UUID account = provisioner.createUser(com.hub.hr.domain.identity.NewIdentity.withoutCredential(
                "omar.tazi@example.com", "omar.tazi@example.com", "Omar", "Tazi", "MANAGER"));

        assertThat(provisioner.findAccount("omar.tazi@example.com")).contains(account);
        assertThatCode(() -> {
            provisioner.assignRealmRole(account, "MANAGER");
            provisioner.addRequiredAction(account, "UPDATE_PASSWORD");
            provisioner.resetPassword(account, "irrelevant-and-discarded", true);
            provisioner.setEnabled(account, false);
            provisioner.logoutAllSessions(account);
            provisioner.clearBruteForce(account);
        }).doesNotThrowAnyException();
        assertThat(provisioner.realmRolesOf(account)).containsExactly("MANAGER");
    }
}
