-- ============================================================================
-- GeniusBot
-- Migration: 025_marketing_campaigns.sql
-- Purpose  : Marketing consent, WhatsApp campaign definitions, recipient
--            snapshots, and delivery-status tracking.
-- ============================================================================

BEGIN;

ALTER TABLE geniusbot.patients
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS marketing_opt_out_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_source varchar(100);

CREATE TABLE IF NOT EXISTS geniusbot.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  name varchar(255) NOT NULL,
  template_name varchar(100) NOT NULL,
  template_language varchar(10) NOT NULL DEFAULT 'ar',
  campaign_kind varchar(20) NOT NULL,
  audience_type varchar(20) NOT NULL,
  branch_id uuid,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'draft',
  scheduled_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_by_staff_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_clinic_fkey FOREIGN KEY (clinic_id)
    REFERENCES geniusbot.clinics(id) ON DELETE CASCADE,
  CONSTRAINT campaigns_branch_fkey FOREIGN KEY (branch_id)
    REFERENCES geniusbot.branches(id) ON DELETE RESTRICT,
  CONSTRAINT campaigns_staff_fkey FOREIGN KEY (created_by_staff_id)
    REFERENCES geniusbot.staff(id) ON DELETE SET NULL,
  CONSTRAINT campaigns_kind_check CHECK (campaign_kind IN ('occasion','offer')),
  CONSTRAINT campaigns_audience_check CHECK (audience_type IN ('all','branch')),
  CONSTRAINT campaigns_status_check CHECK (status IN ('draft','scheduled','running','completed','cancelled')),
  CONSTRAINT campaigns_branch_scope_check CHECK (
    (audience_type = 'branch' AND branch_id IS NOT NULL)
    OR (audience_type = 'all' AND branch_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS geniusbot.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  recipient_phone varchar(50) NOT NULL,
  patient_name varchar(255),
  provider_message_id text,
  status varchar(20) NOT NULL DEFAULT 'pending',
  error_code text,
  error_message text,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  failed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_recipients_campaign_fkey FOREIGN KEY (campaign_id)
    REFERENCES geniusbot.campaigns(id) ON DELETE CASCADE,
  CONSTRAINT campaign_recipients_clinic_fkey FOREIGN KEY (clinic_id)
    REFERENCES geniusbot.clinics(id) ON DELETE CASCADE,
  CONSTRAINT campaign_recipients_patient_fkey FOREIGN KEY (patient_id)
    REFERENCES geniusbot.patients(id) ON DELETE RESTRICT,
  CONSTRAINT campaign_recipients_status_check CHECK (
    status IN ('pending','sent','delivered','read','failed','skipped')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_recipients_campaign_patient
  ON geniusbot.campaign_recipients (campaign_id, patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_recipients_provider_message
  ON geniusbot.campaign_recipients (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_due
  ON geniusbot.campaigns (status, scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_campaigns_clinic_created
  ON geniusbot.campaigns (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status
  ON geniusbot.campaign_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_patients_marketing_eligible
  ON geniusbot.patients (clinic_id, is_active, marketing_opt_in)
  WHERE is_active = TRUE AND marketing_opt_in = TRUE;

DO $$
BEGIN
  IF to_regclass('geniusbot.campaigns') IS NULL
     OR to_regclass('geniusbot.campaign_recipients') IS NULL THEN
    RAISE EXCEPTION 'Campaign migration validation failed.';
  END IF;
END;
$$;

COMMIT;
