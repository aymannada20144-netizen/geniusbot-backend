# Database Migrations

## Overview

This directory contains the ordered database migrations for the GeniusBot backend.

Each migration is designed to be:

* PostgreSQL 16+ compatible
* Neon PostgreSQL compatible
* Production Ready
* Idempotent whenever possible
* Executed only in ascending order
* Targeted exclusively to the `geniusbot` schema

---

# Migration Order

The migrations **must always** be executed in the following order.

| Order | File                             | Description                                                                                                    |
| ----: | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
|   001 | `001_initial_schema.sql`         | Creates the complete database schema, extensions, tables, indexes, constraints, functions, triggers and views. |
|   002 | `002_indexes_constraints.sql`    | Applies future index and constraint changes that are introduced after the initial release.                     |
|   003 | `003_functions_triggers.sql`     | Applies updates to stored functions and triggers.                                                              |
|   004 | `004_views.sql`                  | Creates or updates reporting and application views.                                                            |
|   005 | `005_seed_reference_data.sql`    | Inserts or updates reference data.                                                                             |
|   006 | `006_seed_clinic_structure.sql`  | Inserts clinic structure data.                                                                                 |
|   007 | `007_seed_operational_data.sql`  | Inserts operational configuration data.                                                                        |
|   008 | `008_seed_booking_scenarios.sql` | Inserts booking scenarios and testing data.                                                                    |

---

# Incremental Production Migrations

| Order | File                      | Description                                                                 |
| ----: | ------------------------- | --------------------------------------------------------------------------- |
|   007 | `007_rooms_hardening.sql` | Normalizes room types and enforces room lifecycle and branch integrity.     |
|   008 | `008_reset_test_room_data.sql` | Resets and consistently reseeds the approved test clinic room data.    |
|   009 | `009_doctor_working_hours_hardening.sql` | Enforces tenant, activity, and active-period overlap integrity for doctor schedules. |
|   010 | `010_service_assignments_hardening.sql` | Enforces conditional resources, tenant/activity integrity, deterministic defaults, and assignment lookup indexes. |
|   011 | `011_branch_city_integration.sql` | Separates branch city identity and enforces normalized clinic/city/name uniqueness. |
|   012 | `012_patient_lifecycle_hardening.sql` | Hardens patient identity, normalized phones, and historical relationships. |
|   013 | `013_assistant_identity_configuration.sql` | Adds validated clinic-scoped assistant identity settings. |
|   014 | `014_whatsapp_clinic_resolution.sql` | Hardens WhatsApp clinic resolution by Meta phone-number identity. |
|   015 | `015_appointment_booking_reference.sql` | Adds stable appointment booking references. |
|   016 | `016_prices_module_hardening.sql` | Replaces the development prices module with deterministic scope validation, restrictive foreign keys, GiST overlap protection, and the current-prices view. |

Migration 016 assumes the development `prices` table is empty and installs the
prices module directly from its current definition. After applying it, run
`database/tests/prices_module_tests.sql`.

---

# Initial Installation

For a new database:

1. Execute:

```
database/scripts/install_database.sql
```

or execute the migration files sequentially.

---

# Existing Production Database

For an existing production database:

Execute only the migration files that have not yet been applied.

Never recreate the database.

Never execute seed migrations unless explicitly required.

---

# Rollback Strategy

Rollback scripts are intentionally **not** included.

Production rollback should be performed by restoring a verified database backup before the migration began.

---

# Naming Convention

Migration filenames follow:

```
NNN_description.sql
```

Examples:

```
001_initial_schema.sql
009_add_patient_notes.sql
010_create_notifications.sql
011_add_financial_indexes.sql
```

Migration numbers are immutable.

Existing migration files must never be renamed.

---

# Rules

Each migration should:

* begin with

```
BEGIN;
```

* finish with

```
COMMIT;
```

* fail atomically if an error occurs

* avoid destructive operations whenever possible

* include validation at the end when appropriate

* preserve existing production data

* target only the `geniusbot` schema

---

# Seed Migrations

Seed migrations should only contain:

* reference data
* lookup tables
* clinic configuration
* operational configuration
* testing scenarios

Application-generated data such as patients, conversations, appointments, notifications, transactions and logs must never be recreated by production migrations.

---

# Development Workflow

Typical workflow:

```
schema
        ↓
initial migration
        ↓
seed migrations
        ↓
application
        ↓
future incremental migrations
```

---

# Production Recommendations

Before executing any migration:

* create a verified database backup
* verify the target PostgreSQL version
* verify sufficient database permissions
* execute migrations in a staging environment first
* review execution logs
* validate the schema after completion

---

# Notes

* Migration files represent the historical evolution of the database.
* `011_branch_city_integration.sql` separates the reviewed demo branch names from their cities and hardens normalized city/name uniqueness.
* `012_patient_lifecycle_hardening.sql` enforces normalized phone uniqueness and restrictive patient-history foreign keys.
* `013_assistant_identity_configuration.sql` validates and backfills clinic-scoped assistant name and gender settings without replacing valid existing identities.
* `014_whatsapp_clinic_resolution.sql` adds a stable Meta phone-number identifier and unique normalized display-number lookup for fail-closed clinic resolution.
* Schema files represent the latest complete database definition.
* Seed files provide deterministic initial data.
* Scripts automate installation and rebuilding.
* Reports and tests are independent of migrations.
