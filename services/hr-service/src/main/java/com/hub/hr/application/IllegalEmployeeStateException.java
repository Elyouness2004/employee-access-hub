package com.hub.hr.application;

/**
 * A lifecycle operation was requested that the employee's current state does not
 * allow — reactivating a TERMINATED record, for instance. Surfaces as 409: the
 * request conflicts with where the record actually is, and no amount of retrying
 * the same call will change that.
 */
public class IllegalEmployeeStateException extends RuntimeException {

    public IllegalEmployeeStateException(String message) {
        super(message);
    }
}
