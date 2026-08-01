# Doctor Working Hours

## Domain

`geniusbot.doctor_working_hours` stores a doctor's recurring weekly working
periods. It is not used for one-time exceptions. A doctor may have multiple
periods per day and may work in multiple branches.

The complete active weekly schedule is read and replaced through:

- `GET /api/clinics/:clinicId/doctors/:doctorId/working-hours`
- `PUT /api/clinics/:clinicId/doctors/:doctorId/working-hours`

Both responses keep the period array in `data` and expose an opaque schedule
version in `meta.version`. PUT requires the last loaded version and returns
`DOCTOR_WORKING_HOURS_VERSION_CONFLICT` when it is stale.

## Day and time semantics

- `day_of_week`: integer `0` (Sunday) through `6` (Saturday).
- `start_time` and `end_time`: local clinic time, submitted as `HH:mm`.
- Precision is one minute; seconds are normalized to `00`.
- `24:00` and overnight periods are not supported.
- A closed day has no active periods.
- The clinic `timezone` is used when an appointment timestamp is evaluated.

## Integrity rules

- Doctor and branch must exist, be active, and belong to the same clinic.
- Active periods must fit within the selected branch's recurring hours.
- Active periods for the same doctor and weekday cannot overlap, even when
  they belong to different branches.
- Periods use half-open `[start, end)` semantics. Adjacent periods are allowed
  and are not merged automatically.
- Inactive rows do not participate in Availability or overlap exclusion.
- Unknown payload and period fields are rejected.

## Related availability concepts

- Branch working hours bound recurring doctor periods.
- Clinic holidays override a specific date.
- Doctor time off blocks a date/time interval within recurring hours.
- Room time off and existing appointments are evaluated after doctor hours.
- An appointment may end exactly at a period's `end_time`; it may not start
  at `end_time`.

## Stable errors

- `DOCTOR_WORKING_HOURS_INVALID_PAYLOAD`
- `DOCTOR_WORKING_HOURS_UNKNOWN_FIELD`
- `DOCTOR_WORKING_HOURS_INVALID_DAY`
- `DOCTOR_WORKING_HOURS_INVALID_UUID`
- `DOCTOR_WORKING_HOURS_INVALID_TIME_RANGE`
- `DOCTOR_WORKING_HOURS_OVERLAP`
- `DOCTOR_WORKING_HOURS_DOCTOR_NOT_FOUND`
- `DOCTOR_WORKING_HOURS_DOCTOR_INACTIVE`
- `DOCTOR_WORKING_HOURS_BRANCH_NOT_FOUND`
- `DOCTOR_WORKING_HOURS_BRANCH_INACTIVE`
- `DOCTOR_WORKING_HOURS_CLINIC_MISMATCH`
- `DOCTOR_WORKING_HOURS_OUTSIDE_BRANCH_HOURS`
- `DOCTOR_WORKING_HOURS_VERSION_REQUIRED`
- `DOCTOR_WORKING_HOURS_VERSION_CONFLICT`

## Deployment

Apply `009_doctor_working_hours_hardening.sql` after migrations 007 and 008.
Run its preflight against a backup or restore branch first, then run the
Doctor Working Hours database, backend, Availability, Booking, and dashboard
regression suites.
