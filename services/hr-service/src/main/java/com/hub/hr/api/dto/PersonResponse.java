package com.hub.hr.api.dto;

import java.util.UUID;

import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;

/**
 * One person as a DISPLAY identity — the human-readable half of a reference that
 * is stored as a UUID.
 *
 * <p>Every surface in the platform stores people as opaque identifiers:
 * {@code decidedBy}, {@code employeeKeycloakId}, {@code firstApproverKeycloakId},
 * an audit {@code resource} of {@code employee:<uuid>}, an audit {@code actor} of
 * {@code preferred_username}. None of those are readable, and each bounded
 * context deliberately keeps names out of its own model (§2.5) — leave and
 * expense know an employee's id, status and manager and nothing else. This
 * projection is the ONE place the platform turns such a reference back into a
 * person, so no service has to grow a name column and no client has to guess.
 *
 * <p>It carries only what a display needs: the two identifiers so a caller can
 * key its own lookup, the name, the matricule, the work e-mail and the
 * employment status. Nothing sensitive is added — hire date, department,
 * position, manager and the provisioning state stay on the HR-only projections.
 *
 * <p>{@code username} is DERIVED, not stored: the local part of the work e-mail.
 * hr-service provisions Keycloak accounts with the e-mail as the username, while
 * accounts created outside it (the demo seeder, an LDAP import) use the short
 * login. Both forms resolve to the same person, so both are offered and a caller
 * matching an audit actor can use whichever it holds.
 */
public record PersonResponse(
        UUID employeeId,
        UUID keycloakId,
        String matricule,
        String firstName,
        String lastName,
        String displayName,
        String username,
        String email,
        EmployeeStatus status) {

    public static PersonResponse from(Employee employee) {
        return new PersonResponse(
                employee.getId(),
                employee.getKeycloakId(),
                employee.getMatricule(),
                employee.getFirstName(),
                employee.getLastName(),
                employee.getFirstName() + " " + employee.getLastName(),
                usernameOf(employee.getEmail()),
                employee.getEmail(),
                employee.getStatus());
    }

    /** Local part of the work e-mail — the short Keycloak login for the same account. */
    static String usernameOf(String email) {
        if (email == null) {
            return null;
        }
        int at = email.indexOf('@');
        return at < 0 ? email : email.substring(0, at);
    }
}
