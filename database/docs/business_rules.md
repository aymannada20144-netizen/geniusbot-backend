# GeniusBot Database Business Rules

This document defines the core business rules enforced or expected by the GeniusBot Backend database and services.

## 1. Clinic Rules

- Every operational record must belong to a clinic through `clinic_id` where applicable.
- A clinic must be active before accepting bookings.
- Inactive clinics must not allow new appointments.
- Clinic-level holidays apply to all branches when `branch_id` is `NULL`.
- `branches.city` is the only official source for a branch city; `branches.name` stores the branch name only.
- Branch names are unique per clinic and normalized city, so the same name may be used in different cities.
- Patient records are deactivated by default when used; hard delete is allowed only when no operational or historical relationship exists.
- Patient phone identity is unique per clinic after Saudi-mobile normalization, and patient history never cascades on patient deletion.

## 2. Branch Rules

- Every branch belongs to one clinic.
- A branch must be active before accepting bookings.
- Branch working hours define the weekly recurring schedule.
- Weekly closing days must be stored in `branch_working_hours`, not duplicated as holidays.

Example:

- Friday closure is stored using `day_of_week = 5` and `is_closed = true`.
- `clinic_holidays` is only for exceptional dates.

## 3. Holiday Rules

- `clinic_holidays` is used for one-time or exceptional closure dates.
- If `branch_id` is `NULL`, the holiday applies to the whole clinic.
- If `branch_id` is set, the holiday applies only to that branch.
- A holiday may close the clinic or branch fully for the day.
- Regular weekly closures must not be inserted as yearly holiday rows.

## 4. Doctor Rules

- Every doctor belongs to one clinic.
- A doctor must be active before being assigned to services.
- A doctor may have one or more specialties.
- A doctor may work in one or more branches.
- Doctor working hours are recurring weekly local-time periods.
- Weekdays use integers from `0` (Sunday) through `6` (Saturday).
- Multiple periods per day and adjacent periods are allowed.
- Active periods for one doctor must not overlap, including across branches.
- A closed doctor day is represented by having no active period.
- Overnight periods are not supported.
- Doctor periods must fit within the selected branch working hours.
- Doctor availability depends on:
  - Doctor working hours
  - Doctor time off
  - Existing appointments
  - Branch working hours
  - Clinic holidays

## 5. Room Rules

- Every room belongs to one branch.
- A room must be active before being used in appointments.
- A room cannot be assigned to two overlapping active appointments.
- Room time off blocks the room for maintenance or operational reasons.

## 6. Service Rules

- Every service belongs to one clinic.
- A service may belong to a specialty.
- A service must be active to appear in the system.
- A service must have `is_booking_enabled = true` to accept bookings.
- Service duration is stored in minutes.
- Services may require:
  - Doctor
  - Room
  - Both
  - Neither, depending on future use cases

## 7. Service Assignment Rules

- A service assignment links a clinic, branch, and service to the doctor and
  room required by that service. `doctor_id` is required only when
  `services.requires_doctor` is true, and `room_id` is required only when
  `services.requires_room` is true.
- Active assignments require active, same-clinic resources, a bookable
  service, a same-branch room, and branch working hours for a required doctor.
- Booking tries the active default assignment first, then the remaining active
  assignments in deterministic creation order.
- A service must have at least one active assignment before it can be booked.
- Only one default assignment should exist per branch and service combination.
- Only an active default participates in the one-default rule. Deactivating an
  assignment prevents new bookings but does not change existing appointments.
- Hard deletion is conservative: an assignment matching any appointment is
  retained and must be deactivated instead.

## 8. Patient Rules

- Every patient belongs to one clinic.
- A patient may be identified by:
  - `patient_id`
  - phone number
  - WhatsApp ID
- If `patient_id` is provided, the system loads the existing patient.
- If `patient_id` is not provided, the system may find or create a patient using the phone number.
- Patient phone numbers should be unique per clinic.

## 9. Appointment Rules

### Price history

- A price scope is `clinic_id`, `service_id`, `payment_method_id`,
  `insurance_company_id`, `insurance_class_id`, `valid_from`, and `valid_to`.
- Cash prices require both insurance identifiers to be `NULL`.
- Insurance prices require both insurance identifiers, and the insurance class
  must belong to the selected insurance company.
- Every referenced clinic, service, payment method, insurance company, and
  insurance class must be active and must belong to the same clinic.
- `price` must be greater than or equal to zero.
- Currency defaults to `SAR`, is trimmed and normalized to uppercase, and must
  be a three-letter uppercase ISO code.
- `valid_to` is inclusive, must not precede `valid_from`, and may be `NULL` for
  an open-ended period.
- Active periods in the same complete scope cannot overlap. Adjacent periods
  are allowed.
- Historical price rows remain stored. Every price foreign key uses
  `ON DELETE RESTRICT`.
- `vw_current_service_prices` returns only active prices whose validity period
  includes the current date.

- Every appointment belongs to:
  - Clinic
  - Branch
  - Patient
  - Service
  - Doctor
  - Room
- Appointment start must be before appointment end.
- Appointment dates must be valid timestamps.
- A doctor cannot have overlapping active appointments.
- A room cannot have overlapping active appointments.
- Appointment conflicts are checked before creation.

## 10. Appointment Status Rules

Supported appointment statuses include:

- `pending`
- `confirmed`
- `completed`
- `cancelled`
- `no_show`

Expected behavior:

- A pending appointment may be confirmed.
- A pending appointment may be cancelled.
- A confirmed appointment may be completed.
- A confirmed appointment may be cancelled.
- A confirmed appointment may be marked as no-show.
- A completed appointment must not be cancelled.
- A cancelled appointment must not be completed.
- A no-show appointment must not be completed unless explicitly reopened in a future feature.

## 11. Booking Rules

Booking flow must follow this order:

1. Validate booking input.
2. Validate clinic.
3. Validate service.
4. Resolve patient.
5. Build appointment times.
6. Resolve service assignment.
7. Check availability.
8. Create appointment.

Booking must fail safely if:

- Clinic is missing or inactive.
- Service is missing or booking disabled.
- Patient cannot be resolved.
- No assignment exists.
- Doctor has a conflict.
- Room has a conflict.
- Appointment date is invalid.
- Appointment end is not greater than appointment start.

## 12. Availability Rules

Availability checks:

- Active clinic and configured clinic timezone
- Clinic and branch holidays
- Branch working hours
- Doctor working hours
- Doctor time off
- Active room and room time off
- Doctor conflict
- Room conflict
- Valid appointment start and end

## 13. Waitlist Rules

- Waitlist records belong to a clinic, branch, patient, and service.
- A waitlist record represents interest in a future appointment slot.
- A waitlist item may have statuses such as:
  - `waiting`
  - `contacted`
  - `booked`
  - `cancelled`

## 14. Payment Rules

- Payment methods belong to clinics.
- Payments may be linked to appointments, invoices, or visits depending on implementation.
- Supported payment methods may include:
  - Cash
  - Card
  - Insurance
  - Bank transfer
- Refunds must be traceable and must not overwrite the original payment record.

## 15. Insurance Rules

- Insurance companies belong to clinics.
- Insurance classes belong to insurance companies.
- A service price may differ by payment method, insurance company, and insurance class.
- Rejected insurance classes must not be used for booking or billing.

## 16. Pricing Rules

- Price writes are normalized and validated by
  `prices_validate_before_write()` through
  `trg_prices_validate_before_write`.
- Overlap protection is enforced by the
  `excl_prices_active_period_overlap` GiST exclusion constraint, not by trigger
  code.
- Current price reads use `vw_current_service_prices`.

## 17. Dashboard Rules

Dashboard data must be calculated from source tables, not manually entered.

Dashboard statistics may include:

- Total appointments
- Pending appointments
- Confirmed appointments
- Completed appointments
- Cancelled appointments
- No-show appointments
- Today appointments
- Upcoming appointments
- Revenue
- Doctor performance
- Patient activity

## 18. Audit Rules

Important business actions should eventually be logged, including:

- Appointment creation
- Appointment update
- Appointment cancellation
- Appointment completion
- No-show marking
- Payment creation
- Refund creation
- Patient updates

Audit logs should not be edited after creation.

## 19. Notification Rules

Notifications may be generated for:

- Appointment confirmation
- Appointment reminder
- Appointment cancellation
- Review request
- Waitlist follow-up

Notification statuses may include:

- `pending`
- `sent`
- `failed`

Failed notifications should preserve the failure reason.

## 20. Data Integrity Rules

- UUIDs are used as primary identifiers.
- Foreign keys must point to valid parent records.
- Soft deactivation is preferred over deletion for operational records.
- Historical records should not be deleted if used in reporting.
- Test data must be clearly separated from production data.
