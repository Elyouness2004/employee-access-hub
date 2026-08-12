package com.hub.expense.api;

import java.util.LinkedHashMap;
import java.util.Map;

import com.hub.expense.application.EmployeeNotEligibleException;
import com.hub.expense.application.ResourceNotFoundException;
import com.hub.expense.domain.BusinessRuleViolationException;
import com.hub.expense.domain.HrDirectoryUnavailableException;
import com.hub.expense.domain.IllegalExpenseStateException;
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
 * catch-all handler: Spring Security's 401/403 translation and the default 500
 * path must stay untouched.
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

    @ExceptionHandler(ResourceNotFoundException.class)
    ProblemDetail onNotFound(ResourceNotFoundException ex) {
        return problem(HttpStatus.NOT_FOUND, "Resource not found", ex.getMessage());
    }

    /** BR-01/02/03 and other domain validations → 422, BR code included. */
    @ExceptionHandler(BusinessRuleViolationException.class)
    ProblemDetail onBusinessRuleViolation(BusinessRuleViolationException ex) {
        ProblemDetail problem = problem(HttpStatus.UNPROCESSABLE_ENTITY,
                "Business rule violation", ex.getMessage());
        if (ex.getRule() != null) {
            problem.setProperty("rule", ex.getRule());
        }
        return problem;
    }

    @ExceptionHandler(EmployeeNotEligibleException.class)
    ProblemDetail onEmployeeNotEligible(EmployeeNotEligibleException ex) {
        return problem(HttpStatus.UNPROCESSABLE_ENTITY, "Employee not eligible", ex.getMessage());
    }

    /** BR-04: a terminal claim (e.g. REJECTED) cannot be modified → 409. */
    @ExceptionHandler(IllegalExpenseStateException.class)
    ProblemDetail onIllegalState(IllegalExpenseStateException ex) {
        return problem(HttpStatus.CONFLICT, "Conflict", ex.getMessage());
    }

    /** Circuit-breaker fallback of last resort: degrade loudly, do not cascade. */
    @ExceptionHandler(HrDirectoryUnavailableException.class)
    ProblemDetail onHrUnavailable(HrDirectoryUnavailableException ex) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "HR service unavailable", ex.getMessage());
    }

    /** Safety net for races the proactive service checks cannot see. */
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
