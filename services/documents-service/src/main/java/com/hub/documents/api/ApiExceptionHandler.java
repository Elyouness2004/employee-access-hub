package com.hub.documents.api;

import java.util.LinkedHashMap;
import java.util.Map;

import com.hub.documents.application.DocumentTooLargeException;
import com.hub.documents.application.DuplicateResourceException;
import com.hub.documents.application.EmptyUploadException;
import com.hub.documents.application.InvalidReferenceException;
import com.hub.documents.application.ResourceInUseException;
import com.hub.documents.application.ResourceNotFoundException;
import com.hub.documents.application.UnsupportedDocumentTypeException;
import com.hub.documents.domain.storage.DocumentStorageException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

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

    @ExceptionHandler(InvalidReferenceException.class)
    ProblemDetail onInvalidReference(InvalidReferenceException ex) {
        return problem(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid reference", ex.getMessage());
    }

    @ExceptionHandler(DuplicateResourceException.class)
    ProblemDetail onDuplicate(DuplicateResourceException ex) {
        return problem(HttpStatus.CONFLICT, "Conflict", ex.getMessage());
    }

    @ExceptionHandler(ResourceInUseException.class)
    ProblemDetail onInUse(ResourceInUseException ex) {
        return problem(HttpStatus.CONFLICT, "Conflict", ex.getMessage());
    }

    /**
     * A multipart upload that is missing the {@code file} or {@code metadata}
     * part, or carries no bytes: the request itself is malformed, so it is a 400
     * — distinct from the policy refusals below, which are about a well-formed
     * file this deployment declines to store.
     */
    @ExceptionHandler({MissingServletRequestPartException.class,
                       MissingServletRequestParameterException.class,
                       EmptyUploadException.class})
    ProblemDetail onIncompleteUpload(Exception ex) {
        return problem(HttpStatus.BAD_REQUEST, "Malformed request", ex.getMessage());
    }

    /** Above the configured ceiling — from the policy check, or from the servlet container first. */
    @ExceptionHandler({DocumentTooLargeException.class, MaxUploadSizeExceededException.class})
    ProblemDetail onTooLarge(Exception ex) {
        return problem(HttpStatus.PAYLOAD_TOO_LARGE, "File too large", ex.getMessage());
    }

    @ExceptionHandler(UnsupportedDocumentTypeException.class)
    ProblemDetail onUnsupportedType(UnsupportedDocumentTypeException ex) {
        return problem(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported file type", ex.getMessage());
    }

    /**
     * The blob store itself is unreachable or unusable — an outage to retry,
     * mirroring how an unavailable identity provider is reported by hr-service.
     * A document that merely has no bytes is a 404 on the content sub-resource,
     * not this.
     */
    @ExceptionHandler(DocumentStorageException.class)
    ProblemDetail onStorageUnavailable(DocumentStorageException ex) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Document storage unavailable", ex.getMessage());
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
