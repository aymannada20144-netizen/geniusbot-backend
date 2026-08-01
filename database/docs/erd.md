# GeniusBot Database Entity Relationship Overview

This document describes the logical relationships between the database entities.

---

# High-Level ERD

```text
Clinic
│
├── Branches
│     ├── Branch Working Hours
│     ├── Rooms
│     │      └── Room Time Off
│     │
│     └── Service Assignments
│
├── Clinic Holidays
│
├── Doctors
│     ├── Doctor Specialties
│     ├── Doctor Working Hours
│     └── Doctor Time Off
│
├── Specialties
│
├── Services
│
├── Patients
│     ├── Appointments
│     ├── Patient Visits
│     ├── Reviews
│     └── Waitlist
│
├── Payment Methods
│
├── Insurance Companies
│     └── Insurance Classes
│
├── Prices
│
├── Invoices
│     └── Invoice Items
│
├── Payments
│
├── Notifications
│
├── Conversation History
│
└── Audit Logs

## Doctor Working Hours relationship

`doctor_working_hours` references one doctor and one branch. The doctor and
branch must belong to the same clinic. The clinic relationship is therefore
derived rather than duplicated on the schedule row. Active rows are recurring
weekly local-time periods and are overlap-protected by doctor and weekday,
including periods assigned to different branches.

## Service Assignment relationship

`service_assignments` belongs directly to one clinic, branch, and service.
Doctor and room are conditional resources governed by the service
`requires_doctor` and `requires_room` flags. Active assignments use only
active same-clinic resources; a room must belong to the assignment branch,
and a required doctor must have active working hours in that branch.

## Price relationship

`prices` belongs to one clinic, service, and payment method. Cash rows have no
insurance references. Insurance rows reference an active company and an active
class belonging to that company. Every referenced resource belongs to the same
clinic. All parent relationships use `ON DELETE RESTRICT`, so historical price
rows remain stored while they are referenced.

The complete price scope is clinic, service, payment method, optional insurance
company, optional insurance class, and an inclusive validity period. Active
periods cannot overlap within the same resource scope; adjacent periods are
allowed. A `NULL` end date represents an open-ended period.

`vw_current_service_prices` exposes only active price rows whose validity period
includes the current date.
