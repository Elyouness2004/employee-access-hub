package com.hub.hr.application;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.hub.hr.domain.identity.IdentityProvisioner;
import org.springframework.stereotype.Component;

/**
 * Applies the realm role {@link RealmRoleResolver} derived to a Keycloak account
 * as a <b>replacement</b>, not an addition.
 *
 * <p>Granting alone is not synchronization. A manager who loses their last direct
 * report resolves to {@code EMPLOYEE}, but if the account keeps its {@code MANAGER}
 * mapping they keep every manager capability — approving leave and expenses for a
 * team they no longer lead — and the next token renewal hands them the role again.
 * So a sync grants what is derived and revokes the derived roles that outrank it.
 *
 * <p>Only the two <b>derived</b> roles are ever touched. {@code HR} and
 * {@code ADMIN} are assigned deliberately by administrators
 * ({@link RealmRoleResolver}) and are invisible to this class: a role sync must
 * never quietly strip somebody's HR access because their reporting line changed.
 * {@code MANAGER} is a composite of {@code EMPLOYEE}, so granting it needs no
 * second mapping and an explicit {@code EMPLOYEE} alongside it is redundant, not
 * wrong — it is left alone.
 */
@Component
public class RealmRoleSynchronizer {

    /** Derived roles, weakest first. Everything above the desired one is revoked. */
    private static final List<String> DERIVED_BY_RANK =
            List.of(RealmRoleResolver.EMPLOYEE, RealmRoleResolver.MANAGER);

    private final IdentityProvisioner identity;

    public RealmRoleSynchronizer(IdentityProvisioner identity) {
        this.identity = identity;
    }

    /**
     * Make {@code desired} the account's effective derived role.
     *
     * @return what actually changed, for the history/audit detail
     */
    public RoleSyncResult synchronize(UUID keycloakId, String desired) {
        Set<String> current = identity.realmRolesOf(keycloakId);
        boolean granted = false;
        if (!current.contains(desired)) {
            identity.assignRealmRole(keycloakId, desired);
            granted = true;
        }
        Set<String> revoked = new LinkedHashSet<>();
        for (String role : outranking(desired)) {
            if (current.contains(role)) {
                identity.removeRealmRole(keycloakId, role);
                revoked.add(role);
            }
        }
        return new RoleSyncResult(desired, granted, Set.copyOf(revoked));
    }

    /** Derived roles stronger than {@code desired}; empty for an unknown role. */
    private static List<String> outranking(String desired) {
        int rank = DERIVED_BY_RANK.indexOf(desired);
        return rank < 0 ? List.of() : DERIVED_BY_RANK.subList(rank + 1, DERIVED_BY_RANK.size());
    }

    /** What a synchronization did to the account, for the audit detail. */
    public record RoleSyncResult(String role, boolean granted, Set<String> revoked) {

        public boolean changed() {
            return granted || !revoked.isEmpty();
        }

        /** Audit-friendly summary, e.g. {@code role=EMPLOYEE revoked=[MANAGER]}. */
        public String describe() {
            return "role=" + role + (revoked.isEmpty() ? "" : " revoked=" + revoked);
        }
    }
}
