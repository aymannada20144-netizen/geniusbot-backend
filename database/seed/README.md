# GeniusBot Database Seed

This directory contains deterministic seed assets for the approved PostgreSQL schema:

```text
geniusbot
```

The seed files must not insert data into legacy tables inside the `public` schema.

## Files

```text
database/
└── seed/
    ├── README.md
    ├── 001_reference_data.sql
    ├── 002_clinic_structure.sql
    ├── 003_operational_data.sql
    └── 004_booking_scenarios.sql
```

## Execution Order

Run the files in the following order:

```text
001_reference_data.sql
002_clinic_structure.sql
003_operational_data.sql
004_booking_scenarios.sql
```

Each file depends on data created by the preceding files.

## Seed Responsibilities

### 001_reference_data.sql

Contains stable reference and lookup data required by the rest of the database seed.

Typical responsibilities include:

* Reference values
* Lookup values
* Status values
* Supported configuration values
* Shared immutable records

This file must not contain:

* Clinics
* Branches
* Doctors
* Patients
* Appointments

---

### 002_clinic_structure.sql

Contains the structural data for the demo clinic.

Typical responsibilities include:

* Clinic
* Branches
* Specialties
* Rooms
* Clinic working hours
* Branch working hours
* Clinic holidays
* Recurring closure rules

This file must not contain:

* Patients
* Appointments
* Appointment history

---

### 003_operational_data.sql

Contains the operational configuration required for booking.

It includes:

* Services
* Doctors
* Doctor specialties
* Doctor working hours
* Payment methods
* Insurance companies
* Insurance classes
* Prices
* Service assignments to doctors and rooms

This file must not contain:

* Patients
* Appointments
* Appointment reminders
* Appointment status history

---

### 004_booking_scenarios.sql

Contains deterministic booking data used for development, dashboard verification, and integration testing.

It includes:

* Demo patients
* Pending appointments
* Confirmed appointments
* Completed appointments
* Cancelled appointments
* No-show appointments
* Rescheduled appointment scenarios
* Appointment status history
* Appointment reminders

The scenarios must avoid invalid overlaps between:

* Doctors
* Rooms
* Patients

## Schema Rules

All seed statements must explicitly target the approved schema:

```sql
geniusbot
```

Recommended session configuration:

```sql
SET search_path TO geniusbot, public;
```

Tables from the previous database version inside `public` must not be referenced.

Valid example:

```sql
INSERT INTO geniusbot.services (...);
```

Invalid example:

```sql
INSERT INTO public.services (...);
```

## UUID Policy

Seed records use stable UUID values.

Stable UUIDs provide:

* Deterministic foreign-key relationships
* Repeatable local environments
* Predictable integration tests
* Reusable `curl` commands
* Consistent dashboard test results

Seed UUIDs must not be generated using:

```sql
gen_random_uuid()
```

for records referenced by later seed files.

Application-created production records may continue using automatically generated UUIDs.

## Idempotency

Every seed file must be safe to execute more than once.

Preferred pattern:

```sql
INSERT INTO geniusbot.example_table (
    id,
    name
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Example'
)
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    updated_at = NOW();
```

For immutable relationship rows, the following may be used when appropriate:

```sql
ON CONFLICT (...) DO NOTHING;
```

Running a seed file repeatedly must not:

* Create duplicate records
* Create duplicate assignments
* Create duplicate working-hour rows
* Create duplicate prices
* Create conflicting appointments
* Change stable UUID relationships
* Insert data into the wrong schema

## Transaction Policy

Each seed file should execute inside a transaction:

```sql
BEGIN;

SET LOCAL search_path TO geniusbot, public;

-- Seed statements

COMMIT;
```

If validation fails, the transaction must not be committed.

Validation failures should raise an exception:

```sql
RAISE EXCEPTION 'Seed validation failed: %', error_message;
```

## Dependency Validation

Every seed file after `001_reference_data.sql` should validate its required parent records before inserting dependent data.

Example:

```sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM geniusbot.clinics
        WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
    ) THEN
        RAISE EXCEPTION
            'Required clinic record is missing. Run the previous seed files first.';
    END IF;
END
$$;
```

## Final Validation

Each seed file must contain validation at the end.

Validation should confirm:

* Expected records exist
* Foreign-key relationships are correct
* Tenant relationships are consistent
* Active records belong to the correct clinic
* Rooms belong to the correct branch
* Doctors and services belong to the correct clinic
* Appointment start time is before appointment end time
* Payment and insurance relationships are valid
* Active appointments do not overlap
* Expected record counts match actual record counts

Validation should produce both:

* Exceptions for invalid data
* A readable validation result set

Example:

```sql
SELECT
    'services' AS entity_name,
    5 AS expected_count,
    COUNT(*) AS actual_count,
    CASE
        WHEN COUNT(*) = 5 THEN 'PASS'
        ELSE 'FAIL'
    END AS validation_status
FROM geniusbot.services
WHERE id IN (...);
```

## Booking Scenario Rules

Seeded appointments must comply with the approved appointment state model.

Allowed lifecycle examples:

```text
pending → confirmed
pending → cancelled
confirmed → completed
confirmed → no_show
confirmed → cancelled
confirmed → rescheduled
```

Terminal states are:

```text
completed
cancelled
no_show
```

A terminal appointment must not later become:

```text
pending
confirmed
completed
cancelled
no_show
rescheduled
```

unless the database architecture explicitly introduces a new audited transition policy.

## Active Appointment Conflict Rules

Active appointments include:

```text
pending
confirmed
```

Seeded active appointments must not overlap for the same:

* Doctor
* Room
* Patient

Historical or terminal records may share equivalent time ranges only when excluded by the approved database constraints.

## Working Hours Rules

Seeded appointments must be consistent with:

* Clinic working hours
* Branch working hours
* Doctor working hours
* Clinic holidays
* Branch holidays
* Recurring closure rules

The approved weekday mapping must be used consistently across all files.

No appointment should be created on a closed day or outside the assigned doctor's schedule.

## Payment Rules

Cash appointments must have:

```text
payment_method = cash
insurance_company_id = NULL
insurance_class_id = NULL
```

Insurance appointments must have:

```text
payment_method = insurance
insurance_company_id = NOT NULL
insurance_class_id = NOT NULL
```

The insurance class must:

* Belong to the selected insurance company
* Be accepted by the clinic
* Belong to the same clinic tenant context

## Price Rules

Seed prices must include:

* Stable UUID
* Clinic
* Service
* Payment method
* Currency
* Validity period
* Active status

Insurance prices must also include:

* Insurance company
* Insurance class

Fixed dates should be used for deterministic seed prices.

Avoid using:

```sql
CURRENT_DATE
```

as part of a unique pricing key because executing the seed on another date could create a second price record.

## Multi-Tenant Integrity

Every tenant-owned record must remain inside its clinic boundary.

The seed must prevent relationships such as:

* A branch belonging to another clinic
* A doctor assigned to another clinic's service
* A room assigned through another branch
* A patient attached to another clinic
* An insurance company attached to another clinic
* An appointment referencing mixed clinic data

Validation should explicitly check tenant consistency instead of relying only on foreign keys.

## Running the Seed Files

Using `psql`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed/001_reference_data.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed/002_clinic_structure.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed/003_operational_data.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed/004_booking_scenarios.sql
```

Run all seed files from Windows Command Prompt:

```bat
psql "%DATABASE_URL%" -v ON_ERROR_STOP=1 -f database\seed\001_reference_data.sql
psql "%DATABASE_URL%" -v ON_ERROR_STOP=1 -f database\seed\002_clinic_structure.sql
psql "%DATABASE_URL%" -v ON_ERROR_STOP=1 -f database\seed\003_operational_data.sql
psql "%DATABASE_URL%" -v ON_ERROR_STOP=1 -f database\seed\004_booking_scenarios.sql
```

## Recommended Combined Seed Script

A parent script may execute all seed files in order:

```sql
\set ON_ERROR_STOP on

\ir 001_reference_data.sql
\ir 002_clinic_structure.sql
\ir 003_operational_data.sql
\ir 004_booking_scenarios.sql
```

The parent script should be executed from the `database/seed` directory or use paths compatible with `psql`.

## Verification Queries

Check seeded clinics:

```sql
SELECT *
FROM geniusbot.clinics
ORDER BY created_at;
```

Check operational booking configuration:

```sql
SELECT
    s.name AS service_name,
    d.full_name AS doctor_name,
    r.name AS room_name,
    sa.is_default,
    sa.is_active
FROM geniusbot.service_assignments sa
JOIN geniusbot.services s
    ON s.id = sa.service_id
JOIN geniusbot.doctors d
    ON d.id = sa.doctor_id
JOIN geniusbot.rooms r
    ON r.id = sa.room_id
ORDER BY s.name;
```

Check appointment status totals:

```sql
SELECT
    status,
    COUNT(*) AS appointment_count
FROM geniusbot.appointments
GROUP BY status
ORDER BY status;
```

Check upcoming active appointments:

```sql
SELECT
    a.id,
    p.full_name AS patient_name,
    s.name AS service_name,
    d.full_name AS doctor_name,
    a.appointment_start,
    a.appointment_end,
    a.status
FROM geniusbot.appointments a
JOIN geniusbot.patients p
    ON p.id = a.patient_id
JOIN geniusbot.services s
    ON s.id = a.service_id
LEFT JOIN geniusbot.doctors d
    ON d.id = a.doctor_id
WHERE a.status IN ('pending', 'confirmed')
ORDER BY a.appointment_start;
```

Check active doctor conflicts:

```sql
SELECT
    first_appointment.id AS first_appointment_id,
    second_appointment.id AS second_appointment_id,
    first_appointment.doctor_id
FROM geniusbot.appointments first_appointment
JOIN geniusbot.appointments second_appointment
    ON first_appointment.id < second_appointment.id
   AND first_appointment.doctor_id = second_appointment.doctor_id
   AND first_appointment.status IN ('pending', 'confirmed')
   AND second_appointment.status IN ('pending', 'confirmed')
   AND tstzrange(
        first_appointment.appointment_start,
        first_appointment.appointment_end,
        '[)'
   ) && tstzrange(
        second_appointment.appointment_start,
        second_appointment.appointment_end,
        '[)'
   );
```

A correct result returns zero rows.

## Reset Behavior

Seed files are designed to create or restore known records.

They are not responsible for deleting arbitrary production data.

Database resets should be performed through the approved database scripts:

```text
database/scripts/rebuild_database.sql
database/scripts/install_database.sql
```

Do not add broad destructive statements such as:

```sql
DELETE FROM geniusbot.appointments;
TRUNCATE geniusbot.patients CASCADE;
```

inside individual seed files.

## Production Safety

The booking scenarios file contains demonstration and testing data.

Do not execute:

```text
004_booking_scenarios.sql
```

against a live production database unless demo records are explicitly required.

Production installations may execute only:

```text
001_reference_data.sql
002_clinic_structure.sql
003_operational_data.sql
```

when those files contain the intended real clinic configuration.

## Maintenance Rules

When modifying seed assets:

1. Preserve the file execution order.
2. Preserve stable UUIDs already used by tests.
3. Do not silently reuse one UUID for a different entity.
4. Update dependent files when a referenced UUID changes.
5. Keep every file idempotent.
6. Add validation for every new entity group.
7. Do not bypass tenant ownership checks.
8. Do not insert records into legacy `public` tables.
9. Do not introduce appointment conflicts.
10. Run the complete seed sequence after every structural change.
