package com.hub.hr.api;

import java.util.LinkedHashMap;
import java.util.Map;

import com.hub.hr.application.CurrentSessionConfirmationRequiredException;
import com.hub.hr.application.DuplicateResourceException;
import com.hub.hr.application.EmployeeNotProvisionedException;
import com.hub.hr.application.IllegalEmployeeStateException;
import com.hub.hr.application.InvalidReferenceException;
import com.hub.hr.application.ProvisioningException;
import com.hub.hr.application.ResourceInUseException;
import com.hub.hr.application.ResourceNotFoundException;
import com.hub.hr.application.TooManyReferencesException;
import com.hub.hr.domain.identity.IdentityUnavailableException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Maps application errors to RFC 7807 problem responses. Deliberately no
 * catch-all handler: Spring Security's 401/403 translation and the default
 * 500 path must stay untouched.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail onInvalidBody(MethodArgumentNotValidException ex) {
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "Validation failed",
                "One or more request fields are invalid");
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            errors.putIfAbsent(fieldError.getField(), fieldError.getDefaultMessage());
        }
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail onUnreadableBody(HttpMessageNotReadableException ex) {
        return problem(HttpStatus.BAD_REQUEST, "Malformed request body",
                "Request body is missing, not valid JSON, or has a field of the wrong type");
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ProblemDetail onTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid parameter",
                "Parameter '" + ex.getName() + "' has an invalid value");
    }

    /** A batch resolve asked for more references than one request may carry. */
    @ExceptionHandler(TooManyReferencesException.class)
    ProblemDetail onTooManyReferences(TooManyReferencesException ex) {
        return problem(HttpStatus.BAD_REQUEST, "Too many references", ex.getMessage());
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    ProblemDetail onNotFound(ResourceNotFoundException ex) {
        return problem(HttpStatus.NOT_FOUND, "Resource not found", ex.getMessage());
    }

    @ExceptionHandler({DuplicateResourceException.class, ResourceInUseException.class})
    ProblemDetail onConflict(RuntimeException ex) {
        return problem(HttpStatus.CONFLICT, "Conflict", ex.getMessage());
    }

    @ExceptionHandler(InvalidReferenceException.class)
    ProblemDetail onInvalidReference(InvalidReferenceException ex) {
        return problem(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid reference", ex.getMessage());
    }

    /** Terminating the caller's current session without explicit confirmation (Part 8). */
    @ExceptionHandler(CurrentSessionConfirmationRequiredException.class)
    ProblemDetail onConfirmationRequired(CurrentSessionConfirmationRequiredException ex) {
        return problem(HttpStatus.CONFLICT, "Confirmation required", ex.getMessage());
    }

    /** Identity/security action requested for an employee with no linked account. */
    @ExceptionHandler(EmployeeNotProvisionedException.class)
    ProblemDetail onNotProvisioned(EmployeeNotProvisionedException ex) {
        return problem(HttpStatus.CONFLICT, "Not provisioned", ex.getMessage());
    }

    /** Lifecycle action the record's current state forbids (reactivating a TERMINATED employee). */
    @ExceptionHandler(IllegalEmployeeStateException.class)
    ProblemDetail onIllegalEmployeeState(IllegalEmployeeStateException ex) {
        return problem(HttpStatus.CONFLICT, "Illegal state transition", ex.getMessage());
    }

    /**
     * Provisioning could not complete but the state was rolled back to a
     * consistent point (E04): the request was valid, the downstream identity
     * operation failed — a 502, distinct from the 503 of an unreachable provider.
     */
    @ExceptionHandler(ProvisioningException.class)
    ProblemDetail onProvisioningFailed(ProvisioningException ex) {
        return problem(HttpStatus.BAD_GATEWAY, "Provisioning failed", ex.getMessage());
    }

    @ExceptionHandler(IdentityUnavailableException.class)
    ProblemDetail onIdentityUnavailable(IdentityUnavailableException ex) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Identity provider unavailable", ex.getMessage());
    }

    /**
     * Safety net for races the proactive service checks cannot see (concurrent
     * insert of the same unique value, concurrent delete of a referenced row):
     * the DB constraint still wins and surfaces as a conflict, not a 500.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail onDataIntegrityViolation(DataIntegrityViolationException ex) {
        return problem(HttpStatus.CONFLICT, "Conflict",
                "The request conflicts with existing data");
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        return problem;
    }
}
