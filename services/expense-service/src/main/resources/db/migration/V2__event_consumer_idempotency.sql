-- Cross-context event consumption (Part 4).
--
-- expense-service now binds its own queue on the shared employee.events exchange
-- and reacts to hr-service's employee lifecycle. Delivery is at-least-once, so
-- the consumer records the (event id, consumer) pair it has applied in the same
-- transaction as the business effect: a redelivery finds the row and does
-- nothing, instead of cancelling the same claims twice.
--
-- Same shape as hr-service's processed_event table (V2 there), on purpose —
-- one idempotency contract across every consuming context.
create table processed_event (
    event_id     uuid         not null,
    consumer     varchar(100) not null,
    processed_at timestamp with time zone not null,
    constraint pk_processed_event primary key (event_id, consumer)
);
