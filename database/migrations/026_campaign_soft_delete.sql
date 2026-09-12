-- ============================================================================
-- GeniusBot
-- Migration: 026_campaign_soft_delete.sql
-- Purpose  : Retain campaign delivery history while hiding deleted campaigns.
-- ============================================================================

BEGIN;

ALTER TABLE geniusbot.campaigns
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by_staff_id uuid
    REFERENCES geniusbot.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_clinic_active_created
  ON geniusbot.campaigns (clinic_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_due_active
  ON geniusbot.campaigns (status, scheduled_at)
  WHERE status = 'scheduled' AND deleted_at IS NULL;

COMMIT;
