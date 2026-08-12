package com.hub.hr.application;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import com.hub.hr.api.dto.PersonResponse;
import com.hub.hr.domain.Employee;
import com.hub.hr.infrastructure.EmployeeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Resolves the identifiers other surfaces store into the people they refer to.
 *
 * <p>This is a pure READ MODEL over the employee table — no new data, no new
 * store, no second copy of the identity link. It exists because every UUID a
 * user is shown ({@code decidedBy}, {@code employeeKeycloakId}, an audit
 * {@code resource}) is unreadable, and the alternatives are worse: adding names
 * to leave/expense/document projections would put HR data in three more bounded
 * contexts and three more caches to go stale, and resolving them per service
 * would be the same lookup written four times.
 *
 * <p>A resolver, not a directory listing: it answers only for identifiers the
 * caller already holds. There is no search term, no paging and no "everyone"
 * query here — {@link EmployeeService#page} remains the HR/Admin-only way to
 * enumerate people. An unknown or unmatched reference is simply absent from the
 * answer rather than being an error, because a caller resolving a batch of
 * references has no way to know in advance which of them still exist.
 */
@Service
@Transactional(readOnly = true)
public class PeopleDirectoryService {

    /**
     * Per-request reference ceiling. A page of 200 rows can reference at most a
     * few hundred distinct people; beyond that the caller is enumerating, which
     * is what this endpoint is deliberately not for.
     */
    public static final int MAX_REFERENCES = 200;

    private final EmployeeRepository employees;

    public PeopleDirectoryService(EmployeeRepository employees) {
        this.employees = employees;
    }

    /**
     * The people behind a batch of references, de-duplicated. Order follows the
     * matricule so the answer is stable; callers key it by whichever identifier
     * they hold.
     *
     * @param keycloakIds login-account subjects ({@code jwt.sub} / {@code *KeycloakId} fields)
     * @param employeeIds HR record ids
     * @param usernames   {@code preferred_username} values, in either the full-e-mail or
     *                    short-login form (audit actors, document {@code uploadedBy})
     */
    public List<PersonResponse> resolve(Collection<UUID> keycloakIds,
                                        Collection<UUID> employeeIds,
                                        Collection<String> usernames) {
        int total = keycloakIds.size() + employeeIds.size() + usernames.size();
        if (total > MAX_REFERENCES) {
            throw new TooManyReferencesException(
                    "at most " + MAX_REFERENCES + " references may be resolved in one request, got " + total);
        }
        if (total == 0) {
            return List.of();
        }

        // One map keyed by the HR id de-duplicates across the three reference
        // kinds: the same person reached by keycloak id and by username must
        // appear once, not twice.
        Map<UUID, Employee> found = new LinkedHashMap<>();
        collect(found, employees.findAllById(distinct(employeeIds)));
        collect(found, keycloakIds.isEmpty() ? List.of()
                : employees.findAllByKeycloakIdIn(distinct(keycloakIds)));
        collect(found, resolveUsernames(usernames));

        return found.values().stream()
                .sorted((a, b) -> a.getMatricule().compareToIgnoreCase(b.getMatricule()))
                .map(PersonResponse::from)
                .toList();
    }

    /**
     * Usernames match the work e-mail in either form: hr-service provisions
     * Keycloak accounts with the e-mail as the username, while accounts created
     * outside it — the demo seeder, an LDAP import — carry the short login. Both
     * are asked for at once so a caller holding an audit actor does not have to
     * know which convention produced it.
     */
    private List<Employee> resolveUsernames(Collection<String> usernames) {
        List<String> terms = new ArrayList<>();
        for (String username : usernames) {
            if (username == null || username.isBlank()) {
                continue;
            }
            terms.add(username.trim().toLowerCase(Locale.ROOT));
        }
        return terms.isEmpty() ? List.of() : employees.findAllByUsername(terms.stream().distinct().toList());
    }

    private static void collect(Map<UUID, Employee> target, Iterable<Employee> found) {
        for (Employee employee : found) {
            target.putIfAbsent(employee.getId(), employee);
        }
    }

    private static <T> List<T> distinct(Collection<T> values) {
        return values.stream().filter(java.util.Objects::nonNull).distinct().toList();
    }
}
