# GeniusBot Database Business Rules

This document defines the core business rules enforced or expected by the GeniusBot Backend database and services.

## 1. Clinic Rules

- Every operational record must belong to a clinic through `clinic_id` where applicable.
- A clinic must be active before accepting bookings.
- Inactive clinics must not allow new appointments.
- Clinic-level holidays apply to all branches when `branch_id` is `NULL`.

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

- A service assignment links:
  - Clinic
  - Branch
  - Service
  - Doctor
  - Room
- Booking uses the default active assignment for the selected branch and service.
- A service must have at least one active assignment before it can be booked.
- Only one default assignment should exist per branch and service combination.

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

Availability currently checks:

- Doctor conflict
- Room conflict
- Valid appointment start and end

Availability should eventually also check:

- Branch working hours
- Clinic holidays
- Doctor working hours
- Doctor time off
- Room time off

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

- Prices belong to a clinic and service.
- Prices may depend on payment method and insurance data.
- Only active prices should be used.
- Historical prices must not be deleted if they are linked to previous appointments or invoices.

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