# Change-service notification delivery

Apply `database/migrations/027_appointment_change_deliveries.sql` before starting the updated application. No appointment business rules or event payloads change.

The existing committed `appointment.changed` event with `operation=change_service` is consumed by `AppointmentChangeNotificationProcessor`. The publisher passes its stable outbox ID as listener metadata. A PostgreSQL primary key and conditional upsert claim one delivery per event across workers. Other operations retain their current notification behavior.

The processor reuses `NotificationService.sendRescheduleConfirmation` and its authoritative appointment joins, context formatting, factory and production sender. Its dedicated communication job has one transport attempt; durable event retries handle explicit retryable rejection. The immediate Shaden success reply is preserved.

## Verified Meta contract

Read from Meta on 2026-09-11: `appointment_rescheduled`, status `APPROVED`, language `en`. The Arabic body begins “تم تحديث موعدك بنجاح”. Body parameters in order: patient name, booking reference, service name, branch name, appointment date, appointment time. No provider parameter. No new Meta template is needed.

## Receipts and recovery

`appointment_change_deliveries` stores event ID, status, attempts, retry time, error code and WAMID. A sent receipt prevents resend even if marking the outbox event published failed. Explicit retryable rejections remain unpublished and become eligible after one minute. Permanent failures are retained in the ledger and logged.

Timeouts, missing WAMIDs and server errors have potentially ambiguous external outcomes. They are recorded as `uncertain` without automatic resend. A crash or receipt-write failure can leave `processing`; do not automatically reclaim these records. Reconcile with Meta and the `APPOINTMENT_CHANGE_META_ACCEPTED` / `APPOINTMENT_CHANGE_RECEIPT_FAILED` logs before recording a confirmed WAMID or authorizing a retry. Meta and PostgreSQL do not share a transaction; blind replay cannot guarantee no duplicate sends.

Events already marked published before this fix are not automatically replayed. In particular, the existing Live event observed on 2026-09-11 was already published without a subscriber. Recovery of historical notifications requires explicit selection and reconciliation; never reset all historical outbox events.

Tests use mocked Meta delivery. The opt-in PostgreSQL receipt test uses session-local temporary tables and rolls back; it does not alter Live appointment/outbox rows or send messages.
