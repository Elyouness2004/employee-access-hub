package com.hub.documents.domain;

/**
 * The ranked business roles that gate document access. A category names the
 * minimum role required to see its documents; HR and ADMIN form the "sensitive"
 * tier (FR-41). Ranking lets a single comparison answer "may this caller reach
 * this category".
 */
public enum AccessRole {
    EMPLOYEE(0),
    MANAGER(1),
    HR(2),
    ADMIN(3);

    private final int rank;

    AccessRole(int rank) {
        this.rank = rank;
    }

    /** True when this role is at least as privileged as {@code required}. */
    public boolean satisfies(AccessRole required) {
        return this.rank >= required.rank;
    }

    /** HR/Admin — the tier allowed to read sensitive documents and administer all. */
    public boolean isSensitiveTier() {
        return this == HR || this == ADMIN;
    }
}
