package com.hub.hr.api;

import java.util.List;
import java.util.UUID;

import com.hub.hr.api.dto.PersonResponse;
import com.hub.hr.application.PeopleDirectoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The people RESOLVER: turns identifiers the rest of the platform stores into
 * the people they name.
 *
 * <p>Why it is open to every authenticated caller, unlike the HR-only
 * {@link EmployeeController}: the identifiers it resolves appear on records
 * their own subjects are already entitled to read. An employee reading their own
 * leave request sees {@code decidedBy}; a manager's approvals inbox lists
 * {@code employeeKeycloakId} for their own reports; a document carries
 * {@code uploadedBy}. Every one of those is a UUID or a login today, and the
 * only reason it stays a UUID is that no endpoint would translate it. Restricting
 * the translation to HR would leave exactly the people who need it — everyone
 * else — reading raw UUIDs.
 *
 * <p>What keeps that safe is the shape, not the role: this endpoint answers only
 * for identifiers the caller ALREADY HOLDS. There is no search parameter, no
 * paging, no "list everyone" — the ids are unguessable, so possession of one is
 * itself the evidence of a legitimate reference. It returns work-directory
 * fields only (name, matricule, work e-mail, employment status); everything
 * personal — hire date, department, position, manager, provisioning state —
 * stays on {@link EmployeeController} and {@link MeController}, which are scoped.
 * Enumerating people remains HR/Admin-only through the directory.
 *
 *   GET /api/hr/people?keycloakId=…&amp;employeeId=…&amp;username=…
 *       authenticated · unpaged · ≤200 references per request (400 beyond that)
 *       unknown references are simply absent from the answer
 */
@RestController
@RequestMapping("/api/hr/people")
@Tag(name = "People")
public class PeopleController {

    private final PeopleDirectoryService people;

    public PeopleController(PeopleDirectoryService people) {
        this.people = people;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Resolve stored identifiers (Keycloak subject, employee id, username) "
            + "to display identities; unknown references are omitted")
    public List<PersonResponse> resolve(
            @RequestParam(name = "keycloakId", required = false) List<UUID> keycloakIds,
            @RequestParam(name = "employeeId", required = false) List<UUID> employeeIds,
            @RequestParam(name = "username", required = false) List<String> usernames) {
        return people.resolve(
                keycloakIds == null ? List.of() : keycloakIds,
                employeeIds == null ? List.of() : employeeIds,
                usernames == null ? List.of() : usernames);
    }
}
