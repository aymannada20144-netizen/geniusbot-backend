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