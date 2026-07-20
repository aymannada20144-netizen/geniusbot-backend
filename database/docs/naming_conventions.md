# GeniusBot Database Naming Conventions

Version: 2.0

---

# Purpose

This document defines the official database naming standards used throughout the GeniusBot Backend project.

These conventions ensure:

- Consistent SQL style
- Easy maintenance
- Predictable schema structure
- Compatibility with PostgreSQL best practices
- Easier onboarding for future developers

These rules apply to:

- Schemas
- Tables
- Columns
- Constraints
- Indexes
- Views
- Functions
- Triggers
- Sequences
- SQL Scripts

---

# General Rules

## Use lowercase only

Correct

appointments

Incorrect

Appointments

APPOINTMENTS

Appointment

---

## Use snake_case

Correct

appointment_start

doctor_schedule

patient_notes

Incorrect

AppointmentStart

appointmentStart

appointment-start

---

## Never use spaces

Correct

doctor_schedule

Incorrect

doctor schedule

---

## Never use reserved SQL keywords

Avoid names such as

user

group

table

order

select

where

If unavoidable, rename them.

Example

user_account

service_order

---

# Schema Naming

Project schema

geniusbot

Example

geniusbot.appointments

geniusbot.doctors

---

# Table Naming

Use plural nouns.

Examples

appointments

patients

doctors

services

rooms

branches

clinic_holidays

doctor_schedules

appointment_history

appointment_notes

---

Avoid

appointment

doctor

service

---

# Primary Keys

Every table uses

id UUID PRIMARY KEY

Column name

id

Never

appointment_id

doctor_primary_id

patient_key

inside the same table.

---

# Foreign Keys

Foreign keys use

<entity>_id

Examples

clinic_id

branch_id

patient_id

doctor_id

room_id

service_id

created_by

updated_by

---

# Date Columns

Use descriptive names.

Correct

created_at

updated_at

deleted_at

appointment_start

appointment_end

birth_date

holiday_date

Incorrect

date

time

start

end

---

# Boolean Columns

Boolean columns start with

is_

has_

Examples

is_active

is_deleted

has_whatsapp

has_email

---

# Status Columns

Use

status

Store lowercase values.

Example

pending

confirmed

completed

cancelled

no_show

---

# Name Columns

Human-readable names

name

full_name

display_name

short_name

---

# Contact Columns

phone

email

mobile

whatsapp_number

---

# Notes Columns

notes

description

internal_notes

---

# Monetary Columns

Use NUMERIC.

Examples

price

cost

discount

tax

paid_amount

remaining_amount

---

# UUID Columns

Every identifier is UUID.

Examples

id

patient_id

doctor_id

appointment_id

Never use

SERIAL

BIGSERIAL

INT

unless explicitly required.

---

# Constraint Naming

Primary Key

pk_<table>

Example

pk_patients

Foreign Key

fk_<table>_<reference>

Example

fk_appointments_patient

fk_appointments_doctor

fk_appointments_room

Unique

uq_<table>_<column>

Example

uq_patients_phone

Check

chk_<table>_<column>

Example

chk_appointments_status

---

# Index Naming

Format

idx_<table>_<column>

Examples

idx_patients_phone

idx_appointments_date

idx_doctors_branch

Composite

idx_appointments_doctor_start

---

# Exclusion Constraint

Format

ex_<table>_<purpose>

Example

ex_appointments_doctor_time

---

# Views

Prefix

vw_

Examples

vw_dashboard_summary

vw_today_schedule

vw_financial_summary

---

# Materialized Views

Prefix

mv_

Example

mv_monthly_statistics

---

# Functions

Prefix

fn_

Examples

fn_next_available_slot

fn_generate_invoice

---

# Procedures

Prefix

sp_

Examples

sp_archive_appointments

sp_recalculate_statistics

---

# Triggers

Prefix

trg_

Examples

trg_update_timestamp

trg_log_appointment

---

# Trigger Functions

Prefix

trg_fn_

Example

trg_fn_update_timestamp

---

# Sequences

Prefix

seq_

Although UUID is used, sequences may exist for internal numbering.

Examples

seq_invoice_number

seq_receipt_number

---

# SQL Files

Use snake_case.

Examples

install_database.sql

rebuild_database.sql

seed_demo_data.sql

create_indexes.sql

---

# Migration Files

Format

YYYYMMDD_description.sql

Example

20260708_create_dashboard_views.sql

---

# Seed Files

Prefix

seed_

Examples

seed_branches.sql

seed_services.sql

seed_doctors.sql

---

# Backup Files

Format

backup_YYYYMMDD.sql

Example

backup_20260708.sql

---

# Reports

Store under

database/reports

Examples

dashboard.sql

financial.sql

patients.sql

doctors.sql

---

# Test Files

Store under

database/tests

Examples

smoke_tests.sql

booking_tests.sql

dashboard_tests.sql

---

# SQL Formatting

Keywords

UPPERCASE

SELECT

FROM

WHERE

ORDER BY

INSERT

UPDATE

DELETE

Identifiers

lowercase

One column per line

Example

SELECT
    id,
    full_name,
    phone
FROM geniusbot.patients;

---

# Aliases

Meaningful aliases only.

Good

appointments a

patients p

doctors d

services s

rooms r

branches b

Avoid

x

y

t1

t2

---

# Comments

Use comments to explain business logic.

Example

-- Prevent overlapping appointments

Avoid obvious comments

-- Select all rows

SELECT *

---

# NULL Handling

Prefer explicit handling.

Example

COALESCE(notes, '')

COALESCE(price, 0)

---

# Transactions

Always wrap critical operations.

BEGIN;

...

COMMIT;

Rollback on failure.

---

# Naming Consistency Checklist

✓ Lowercase only

✓ snake_case

✓ Plural table names

✓ UUID identifiers

✓ Descriptive column names

✓ Consistent constraints

✓ Consistent indexes

✓ Standard prefixes

✓ SQL keywords uppercase

✓ Predictable file names

---

# Document Status

Status:

Approved

Version:

2.0

Project:

GeniusBot Backend

Maintained By:

EMAA GROUP LLC