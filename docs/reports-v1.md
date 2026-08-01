# Reports V1

Reports V1 provides clinic-scoped operational reporting only. It covers appointment
summary, appointment-service and booking-creation trends, appointment breakdowns,
patient aggregates, and basic conversation operations. It does not expose revenue,
insurance financials, recovery, missed calls, abandonment, utilization, response
time, exports, patient-level details, message bodies, notes, or other PII.

## Metric dictionary

- Appointment total includes pending, confirmed, completed, cancelled, and no-show.
- Rescheduled is reported separately and excluded from totals and rate denominators.
- Completion, cancellation, and no-show rates divide their status count by total.
  A zero denominator returns `null`.
- Appointment trend uses `appointment_start`.
- New bookings trend uses `appointments.created_at`.
- New patient records use `patients.created_at`.
- Patients with appointments are distinct patient IDs in the selected appointment range.
- First-time booked patients have no appointment before the range start.
- Returning booked patients have at least one appointment before the range start.
- Human takeover means `handover_at IS NOT NULL`.
- AI Present Conversations means `bot_enabled = true`; it is not booking attribution.

## Time and ranges

`clinics.timezone` is authoritative. `from` and `to` are local `YYYY-MM-DD` dates.
Queries use an inclusive local midnight start and the exclusive midnight following
`to`. The maximum range is 366 days. Operational This Week runs Saturday 00:00
through the exclusive Friday 00:00 boundary. Custom and Last 7 Days may include Friday.
General weekly trends use seven-day periods beginning Saturday.

## API and permissions

All routes are below `/api/clinics/:clinicId/reports` and require
`REPORT_VIEW_OPERATIONAL`. Owner and clinic admin see their clinic. Platform admin
must provide the explicit route clinic. A branch manager is always forced to the
branch in the authenticated token. Receptionists and doctors cannot access Reports.

Routes:

- `GET /appointments/summary`
- `GET /appointments/trend?groupBy=day|week`
- `GET /appointments/breakdown?groupBy=city|branch|service|doctor|status|source`
- `GET /patients/summary`
- `GET /conversations/summary`

Common filters are `from`, `to`, `branchId`, `city`, `serviceId`, `doctorId`, and
`status`. Unknown parameters and cross-clinic resource IDs are rejected.
