ALTER TABLE geniusbot.appointment_change_audit
  DROP CONSTRAINT IF EXISTS appointment_change_audit_operation_check;

ALTER TABLE geniusbot.appointment_change_audit
  ADD CONSTRAINT appointment_change_audit_operation_check
  CHECK (operation IN ('cancel', 'reschedule', 'modify', 'change_service', 'change_branch'));
