# Rooms Master Data

Rooms are clinic-owned through their branch:

`rooms.branch_id -> branches.id -> branches.clinic_id`

The `rooms` table does not contain a `clinic_id` column. Every room read and
write must therefore enforce clinic ownership through the branch join.

## Required fields

- `branch_id`
- `room_number`
- `room_name`
- `room_type`
- `is_active` (defaults to `true`)

Text values are trimmed and whitespace-only values are rejected. Room numbers
are unique within a branch and may be repeated in different branches.

## Approved room types

- `consultation`
- `laser`
- `peeling`
- `injection`
- `skin_care`

Stored values are stable English codes. The dashboard supplies localized
display labels and does not accept free text.

## Lifecycle

The branch is immutable after room creation. A room with an active service
assignment or a future pending/confirmed appointment cannot be deactivated.
A room that has any assignment, appointment, or room time-off record cannot be
hard deleted and must be deactivated instead.

Only active rooms belonging to the same branch may be used by service
assignments and active appointments.

## Migration

Run `database/migrations/007_rooms_hardening.sql` in staging before production.
The migration is atomic and deliberately fails before changing data when it
finds:

- an unmapped `room_type`;
- a missing or blank required room value;
- a cross-branch or inactive-room service assignment;
- a cross-branch or inactive-room pending/confirmed appointment.

Resolve reported record IDs explicitly, then rerun the migration. The migration
does not delete records and never converts a value to `NULL`.
