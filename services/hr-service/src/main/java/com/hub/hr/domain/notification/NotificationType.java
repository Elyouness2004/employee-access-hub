package com.hub.hr.domain.notification;

/**
 * The business event a {@link Notification} was raised from. The
 * hr-context-originated types are generated in-process, in the same transaction
 * as the action itself (the existing audit / security-event fan-out idiom); the
 * cross-context types (leave / expense / documents) are raised in their own
 * bounded contexts and land here through the config-gated event consumer when
 * those services publish to the shared broker. Every type carries a
 * {@link Category} (grouping/colour for the read model) and a default
 * {@link #title()} / {@link #message()} — the single copy source used by both the
 * in-process generation and the event consumer, so no wording is duplicated.
 */
public enum NotificationType {

    // Identity lifecycle (hr-service, in-process)
    EMPLOYEE_PROVISIONED(Category.LIFECYCLE, "Account provisioned",
            "Your employee account has been created and is ready to use."),
    EMPLOYEE_UPDATED(Category.LIFECYCLE, "Profile updated",
            "Your employee profile has been updated."),
    ACCOUNT_DISABLED(Category.LIFECYCLE, "Account disabled",
            "Your account has been disabled."),
    EMPLOYEE_TERMINATED(Category.LIFECYCLE, "Account terminated",
            "Your employment has been terminated and your account has been deactivated."),

    // Security actions (hr-service, in-process)
    PASSWORD_RESET(Category.SECURITY, "Password reset",
            "Your password has been reset. You will be asked to set a new one at next sign-in."),
    ACCOUNT_LOCKED(Category.SECURITY, "Account locked",
            "Your account has been locked by an administrator."),
    ACCOUNT_UNLOCKED(Category.SECURITY, "Account unlocked",
            "Your account has been unlocked."),
    ACCOUNT_REACTIVATED(Category.LIFECYCLE, "Account reactivated",
            "Your account has been reactivated and you can sign in again."),
    MFA_ENROLMENT_REQUIRED(Category.SECURITY, "Multi-factor authentication required",
            "You must set up an authenticator app the next time you sign in."),
    SESSION_REVOKED(Category.SECURITY, "Sessions revoked",
            "Your active sessions have been signed out."),
    SECURITY_ALERT(Category.SECURITY, "Security alert",
            "A security-relevant event was detected on your account."),
    ADMIN_ACTION(Category.SECURITY, "Administrative action",
            "An administrator performed an action on your account."),

    // Cross-context (raised by other services; ingested via the event consumer)
    LEAVE_SUBMITTED(Category.LEAVE, "Leave request submitted",
            "Your leave request has been submitted."),
    LEAVE_APPROVED(Category.LEAVE, "Leave request approved",
            "Your leave request has been approved."),
    LEAVE_REJECTED(Category.LEAVE, "Leave request rejected",
            "Your leave request has been rejected."),
    EXPENSE_SUBMITTED(Category.EXPENSE, "Expense submitted",
            "Your expense has been submitted."),
    EXPENSE_APPROVED(Category.EXPENSE, "Expense approved",
            "Your expense has been approved."),
    EXPENSE_REJECTED(Category.EXPENSE, "Expense rejected",
            "Your expense has been rejected."),
    DOCUMENT_UPLOADED(Category.DOCUMENT, "Document uploaded",
            "A document has been uploaded."),
    DOCUMENT_SHARED(Category.DOCUMENT, "Document shared",
            "A document has been shared with you.");

    private final Category category;
    private final String title;
    private final String message;

    NotificationType(Category category, String title, String message) {
        this.category = category;
        this.title = title;
        this.message = message;
    }

    public Category category() {
        return category;
    }

    /** Default human-readable title for a notification of this type. */
    public String title() {
        return title;
    }

    /** Default human-readable message for a notification of this type. */
    public String message() {
        return message;
    }

    /** Coarse grouping for the read model (list filtering / colour). */
    public enum Category {
        LIFECYCLE,
        SECURITY,
        LEAVE,
        EXPENSE,
        DOCUMENT
    }
}
