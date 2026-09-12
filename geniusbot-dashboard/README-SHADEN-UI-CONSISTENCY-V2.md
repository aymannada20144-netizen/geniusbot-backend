# Shaden Dashboard UI Consistency V2

Applied directly to the React/Vite dashboard source.

- Unified semantic action colors across master data, patients, staff, prices, service assignments, and appointments.
- Blue/cyan: view/edit; amber: activate/deactivate; red: delete/cancel; green: refresh/update; violet: reschedule/neutral utility.
- Unified primary add/save buttons.
- Price table payment-method column reduced and actions column enlarged.
- Appointment payment column reduced and actions column enlarged.
- Replaced language select with a single toggle that shows the target language (English in Arabic UI, العربية in English UI).
- New final stylesheet `src/styles/semantic-actions.css` is imported after premium theme so page-level CSS cannot override the semantic palette.

Validation: TypeScript `tsc -b` PASS; ESLint PASS.
