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
* Schema files represent the latest complete database definition.
* Seed files provide deterministic initial data.
* Scripts automate installation and rebuilding.
* Reports and tests are independent of migrations.
