package com.hub.hr.application;

import java.util.UUID;

import com.hub.hr.support.RecordingIdentityProvisioner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Role synchronization is a REPLACEMENT, not an accumulation.
 *
 * The defect this class exists to prevent: a manager who loses their last direct
 * report resolves to EMPLOYEE, but if the account keeps its MANAGER mapping they
 * keep every manager capability — approving leave and expenses for a team they no
 * longer lead — and every token renewal hands it back.
 */
class RealmRoleSynchronizerTest {

    private final RecordingIdentityProvisioner identity = new RecordingIdentityProvisioner();
    private final RealmRoleSynchronizer synchronizer = new RealmRoleSynchronizer(identity);
    private final UUID account = UUID.randomUUID();

    @BeforeEach
    void reset() {
        identity.reset();
    }

    private void given(String... roles) {
        identity.rolesByAccount.put(account, java.util.concurrent.ConcurrentHashMap.newKeySet());
        identity.rolesByAccount.get(account).addAll(java.util.List.of(roles));
    }

    @Test
    void demotingAManagerRevokesManagerRatherThanMerelyAddingEmployee() {
        given("MANAGER");

        RealmRoleSynchronizer.RoleSyncResult result = synchronizer.synchronize(account, "EMPLOYEE");

        assertThat(identity.assignedRoles).containsExactly("EMPLOYEE");
        assertThat(identity.revokedRoles).containsExactly("MANAGER");
        assertThat(identity.realmRolesOf(account)).containsExactly("EMPLOYEE");
        assertThat(result.revoked()).containsExactly("MANAGER");
        assertThat(result.changed()).isTrue();
        assertThat(result.describe()).isEqualTo("role=EMPLOYEE revoked=[MANAGER]");
    }

    @Test
    void promotingToManagerGrantsItAndLeavesTheCompositeEmployeeAlone() {
        given("EMPLOYEE");

        RealmRoleSynchronizer.RoleSyncResult result = synchronizer.synchronize(account, "MANAGER");

        // MANAGER is a composite of EMPLOYEE, so an explicit EMPLOYEE mapping
        // beside it is redundant, not wrong — revoking it would be churn.
        assertThat(identity.assignedRoles).containsExactly("MANAGER");
        assertThat(identity.revokedRoles).isEmpty();
        assertThat(result.revoked()).isEmpty();
    }

    @Test
    void aSyncThatChangesNothingCallsTheProviderNotAtAll() {
        given("EMPLOYEE");

        RealmRoleSynchronizer.RoleSyncResult result = synchronizer.synchronize(account, "EMPLOYEE");

        assertThat(identity.assignedRoles).isEmpty();
        assertThat(identity.revokedRoles).isEmpty();
        assertThat(result.changed()).isFalse();
    }

    @Test
    void hrAndAdminAreNeverRevokedByARoleSync() {
        given("MANAGER", "HR", "ADMIN");

        synchronizer.synchronize(account, "EMPLOYEE");

        // HR and ADMIN are assigned deliberately by administrators. A reporting
        // -line change must never quietly strip somebody's HR access.
        assertThat(identity.revokedRoles).containsExactly("MANAGER");
        assertThat(identity.realmRolesOf(account)).contains("HR", "ADMIN", "EMPLOYEE");
    }

    @Test
    void anAccountWithNoRolesYetSimplyGetsTheDerivedOne() {
        given();

        synchronizer.synchronize(account, "EMPLOYEE");

        assertThat(identity.assignedRoles).containsExactly("EMPLOYEE");
        assertThat(identity.revokedRoles).isEmpty();
    }
}
