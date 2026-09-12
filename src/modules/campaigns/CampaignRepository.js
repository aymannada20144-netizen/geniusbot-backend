'use strict';

class CampaignRepository {
  constructor(db) {
    if (!db || typeof db.query !== 'function') {
      throw new TypeError('CampaignRepository requires a database query interface.');
    }
    this.db = db;
  }


  async setMarketingConsent(clinicId, patientId, optIn, source = 'staff_dashboard') {
    const result = await this.db.query(`
      UPDATE geniusbot.patients
      SET marketing_opt_in = $3,
          marketing_opt_in_at = CASE WHEN $3 THEN COALESCE(marketing_opt_in_at, NOW()) ELSE marketing_opt_in_at END,
          marketing_opt_out_at = CASE WHEN $3 THEN NULL ELSE NOW() END,
          marketing_opt_in_source = CASE WHEN $3 THEN $4 ELSE marketing_opt_in_source END,
          updated_at = NOW()
      WHERE clinic_id = $1 AND id = $2
      RETURNING *
    `, [clinicId, patientId, optIn, source]);
    return result.rows[0] || null;
  }

  async listCampaigns(clinicId, filters = {}) {
    const conditions = ['c.clinic_id = $1', 'c.deleted_at IS NULL'];
    const params = [clinicId];
    const add = (condition, value) => {
      params.push(value);
      conditions.push(condition.replace('?', `$${params.length}`));
    };
    if (filters.search) {
      params.push(filters.search);
      const index = params.length;
      conditions.push(`(c.name ILIKE '%' || $${index} || '%' OR c.template_name ILIKE '%' || $${index} || '%')`);
    }
    if (filters.status) add('c.status = ?', filters.status);
    if (filters.templateName) add('c.template_name = ?', filters.templateName);
    if (filters.dateFrom) add('c.created_at >= ?::date', filters.dateFrom);
    if (filters.dateTo) add("c.created_at < (?::date + INTERVAL '1 day')", filters.dateTo);
    const result = await this.db.query(`
      SELECT
        c.*,
        COALESCE(stats.total_recipients, 0)::int AS total_recipients,
        COALESCE(stats.sent_count, 0)::int AS sent_count,
        COALESCE(stats.delivered_count, 0)::int AS delivered_count,
        COALESCE(stats.read_count, 0)::int AS read_count,
        COALESCE(stats.failed_count, 0)::int AS failed_count,
        COALESCE(stats.skipped_count, 0)::int AS skipped_count
      FROM geniusbot.campaigns c
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total_recipients,
          COUNT(*) FILTER (WHERE status IN ('sent','delivered','read')) AS sent_count,
          COUNT(*) FILTER (WHERE status IN ('delivered','read')) AS delivered_count,
          COUNT(*) FILTER (WHERE status = 'read') AS read_count,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
          COUNT(*) FILTER (WHERE status = 'skipped') AS skipped_count
        FROM geniusbot.campaign_recipients cr
        WHERE cr.campaign_id = c.id
      ) stats ON TRUE
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 200
    `, params);
    return result.rows;
  }

  async getCampaign(clinicId, campaignId) {
    const result = await this.db.query(`
      SELECT *
      FROM geniusbot.campaigns
      WHERE clinic_id = $1 AND id = $2 AND deleted_at IS NULL
      LIMIT 1
    `, [clinicId, campaignId]);
    return result.rows[0] || null;
  }

  async getCampaignIncludingDeleted(clinicId, campaignId) {
    const result = await this.db.query(`
      SELECT *
      FROM geniusbot.campaigns
      WHERE clinic_id = $1 AND id = $2
      LIMIT 1
    `, [clinicId, campaignId]);
    return result.rows[0] || null;
  }

  async branchBelongsToClinic(clinicId, branchId) {
    const result = await this.db.query(`
      SELECT 1
      FROM geniusbot.branches
      WHERE clinic_id = $1 AND id = $2
      LIMIT 1
    `, [clinicId, branchId]);
    return result.rowCount === 1;
  }

  async previewAudience(clinicId, audienceType, branchId = null) {
    const audiencePredicate = audienceType === 'branch'
      ? `AND EXISTS (
          SELECT 1
          FROM geniusbot.appointments a
          WHERE a.clinic_id = p.clinic_id
            AND a.patient_id = p.id
            AND a.branch_id = $2
        )`
      : '';
    const params = audienceType === 'branch' ? [clinicId, branchId] : [clinicId];
    const result = await this.db.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE p.is_active = TRUE
            AND p.marketing_opt_in = TRUE
            AND COALESCE(NULLIF(BTRIM(p.whatsapp_id), ''), NULLIF(BTRIM(p.phone_number), '')) IS NOT NULL
        )::int AS eligible,
        COUNT(*) FILTER (WHERE p.is_active = FALSE)::int AS inactive,
        COUNT(*) FILTER (WHERE p.is_active = TRUE AND p.marketing_opt_in IS NOT TRUE)::int AS no_marketing_consent,
        COUNT(*) FILTER (
          WHERE p.is_active = TRUE
            AND p.marketing_opt_in = TRUE
            AND COALESCE(NULLIF(BTRIM(p.whatsapp_id), ''), NULLIF(BTRIM(p.phone_number), '')) IS NULL
        )::int AS no_whatsapp
      FROM geniusbot.patients p
      WHERE p.clinic_id = $1
      ${audiencePredicate}
    `, params);
    return result.rows[0];
  }

  async createCampaignWithRecipients(input) {
    return this.db.transaction(async (client) => {
      const campaignResult = await client.query(`
        INSERT INTO geniusbot.campaigns (
          clinic_id, name, template_name, template_language,
          campaign_kind, audience_type, branch_id,
          variables, status, scheduled_at, created_by_staff_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
        RETURNING *
      `, [
        input.clinicId,
        input.name,
        input.templateName,
        input.templateLanguage,
        input.campaignKind,
        input.audienceType,
        input.branchId,
        JSON.stringify(input.variables || {}),
        input.status,
        input.scheduledAt,
        input.createdByStaffId,
      ]);
      const campaign = campaignResult.rows[0];
      const branchPredicate = input.audienceType === 'branch'
        ? 'AND EXISTS (SELECT 1 FROM geniusbot.appointments a WHERE a.clinic_id = p.clinic_id AND a.patient_id = p.id AND a.branch_id = $3)'
        : '';
      const params = input.audienceType === 'branch'
        ? [campaign.id, input.clinicId, input.branchId]
        : [campaign.id, input.clinicId];
      await client.query(`
        INSERT INTO geniusbot.campaign_recipients (
          campaign_id, clinic_id, patient_id, recipient_phone, patient_name, status
        )
        SELECT
          $1,
          p.clinic_id,
          p.id,
          COALESCE(NULLIF(BTRIM(p.whatsapp_id), ''), NULLIF(BTRIM(p.phone_number), '')),
          p.full_name,
          'pending'
        FROM geniusbot.patients p
        WHERE p.clinic_id = $2
          AND p.is_active = TRUE
          AND p.marketing_opt_in = TRUE
          AND COALESCE(NULLIF(BTRIM(p.whatsapp_id), ''), NULLIF(BTRIM(p.phone_number), '')) IS NOT NULL
          ${branchPredicate}
        ON CONFLICT (campaign_id, patient_id) DO NOTHING
      `, params);
      return campaign;
    });
  }

  async updateCampaignWithRecipients(input) {
    return this.db.transaction(async (client) => {
      const locked = await client.query(`
        SELECT id, status
        FROM geniusbot.campaigns
        WHERE clinic_id = $1 AND id = $2 AND deleted_at IS NULL
        FOR UPDATE
      `, [input.clinicId, input.campaignId]);
      const existing = locked.rows[0];
      if (!existing || !['draft', 'scheduled'].includes(existing.status)) return null;

      const updated = await client.query(`
        UPDATE geniusbot.campaigns
        SET name = $3,
            template_name = $4,
            template_language = $5,
            campaign_kind = $6,
            audience_type = $7,
            branch_id = $8,
            variables = $9::jsonb,
            status = $10,
            scheduled_at = $11,
            updated_at = NOW()
        WHERE clinic_id = $1 AND id = $2 AND deleted_at IS NULL AND status IN ('draft','scheduled')
        RETURNING *
      `, [
        input.clinicId,
        input.campaignId,
        input.name,
        input.templateName,
        input.templateLanguage,
        input.campaignKind,
        input.audienceType,
        input.branchId,
        JSON.stringify(input.variables || {}),
        input.status,
        input.scheduledAt,
      ]);
      const campaign = updated.rows[0];
      if (!campaign) return null;

      await client.query(`
        DELETE FROM geniusbot.campaign_recipients
        WHERE campaign_id = $1
      `, [campaign.id]);

      const branchPredicate = input.audienceType === 'branch'
        ? 'AND EXISTS (SELECT 1 FROM geniusbot.appointments a WHERE a.clinic_id = p.clinic_id AND a.patient_id = p.id AND a.branch_id = $3)'
        : '';
      const params = input.audienceType === 'branch'
        ? [campaign.id, input.clinicId, input.branchId]
        : [campaign.id, input.clinicId];
      await client.query(`
        INSERT INTO geniusbot.campaign_recipients (
          campaign_id, clinic_id, patient_id, recipient_phone, patient_name, status
        )
        SELECT
          $1,
          p.clinic_id,
          p.id,
          COALESCE(NULLIF(BTRIM(p.whatsapp_id), ''), NULLIF(BTRIM(p.phone_number), '')),
          p.full_name,
          'pending'
        FROM geniusbot.patients p
        WHERE p.clinic_id = $2
          AND p.is_active = TRUE
          AND p.marketing_opt_in = TRUE
          AND COALESCE(NULLIF(BTRIM(p.whatsapp_id), ''), NULLIF(BTRIM(p.phone_number), '')) IS NOT NULL
          ${branchPredicate}
      `, params);

      return campaign;
    });
  }

  async claimForRun(clinicId, campaignId) {
    const result = await this.db.query(`
      UPDATE geniusbot.campaigns
      SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      WHERE clinic_id = $1
        AND id = $2
        AND deleted_at IS NULL
        AND status IN ('draft','scheduled')
        AND (status = 'draft' OR scheduled_at <= NOW())
      RETURNING *
    `, [clinicId, campaignId]);
    return result.rows[0] || null;
  }

  async claimNextScheduled() {
    return this.db.transaction(async (client) => {
      const selected = await client.query(`
        SELECT id, clinic_id
        FROM geniusbot.campaigns
        WHERE status = 'scheduled'
          AND deleted_at IS NULL
          AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      const row = selected.rows[0];
      if (!row) return null;
      const updated = await client.query(`
        UPDATE geniusbot.campaigns
        SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
        WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL AND status = 'scheduled'
        RETURNING *
      `, [row.id, row.clinic_id]);
      return updated.rows[0] || null;
    });
  }

  async listPendingRecipients(campaignId) {
    const result = await this.db.query(`
      SELECT cr.*
      FROM geniusbot.campaign_recipients cr
      INNER JOIN geniusbot.campaigns c ON c.id = cr.campaign_id
      WHERE cr.campaign_id = $1
        AND cr.status = 'pending'
        AND c.deleted_at IS NULL
      ORDER BY cr.created_at ASC, cr.id ASC
    `, [campaignId]);
    return result.rows;
  }

  async markRecipientSent(recipientId, providerMessageId) {
    const result = await this.db.query(`
      UPDATE geniusbot.campaign_recipients
      SET status = 'sent', provider_message_id = $2, sent_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [recipientId, providerMessageId]);
    return result.rows[0] || null;
  }

  async markRecipientFailed(recipientId, error) {
    const result = await this.db.query(`
      UPDATE geniusbot.campaign_recipients
      SET status = 'failed', failed_at = NOW(),
          error_code = $2, error_message = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [recipientId, error?.code || null, error?.message || 'Campaign delivery failed.']);
    return result.rows[0] || null;
  }

  async updateDeliveryStatus(providerMessageId, providerStatus, occurredAt, error = null) {
    const status = providerStatus === 'read'
      ? 'read'
      : providerStatus === 'delivered'
        ? 'delivered'
        : providerStatus === 'sent'
          ? 'sent'
          : providerStatus === 'failed'
            ? 'failed'
            : null;
    if (!status) return null;
    const timestampColumn = status === 'read'
      ? 'read_at'
      : status === 'delivered'
        ? 'delivered_at'
        : status === 'failed'
          ? 'failed_at'
          : 'sent_at';
    const result = await this.db.query(`
      UPDATE geniusbot.campaign_recipients
      SET status = CASE
            WHEN status = 'read' THEN 'read'
            WHEN $2 = 'read' THEN 'read'
            WHEN status = 'delivered' AND $2 = 'sent' THEN 'delivered'
            ELSE $2
          END,
          ${timestampColumn} = COALESCE(${timestampColumn}, $3),
          error_code = CASE WHEN $2 = 'failed' THEN $4 ELSE error_code END,
          error_message = CASE WHEN $2 = 'failed' THEN $5 ELSE error_message END,
          updated_at = NOW()
      WHERE provider_message_id = $1
      RETURNING *
    `, [
      providerMessageId,
      status,
      occurredAt,
      error?.code || null,
      error?.message || null,
    ]);
    return result.rows[0] || null;
  }

  async completeCampaign(campaignId) {
    const result = await this.db.query(`
      UPDATE geniusbot.campaigns
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL AND status = 'running'
      RETURNING *
    `, [campaignId]);
    return result.rows[0] || null;
  }

  async cancelCampaign(clinicId, campaignId) {
    const result = await this.db.query(`
      UPDATE geniusbot.campaigns
      SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
      WHERE clinic_id = $1 AND id = $2 AND deleted_at IS NULL AND status IN ('draft','scheduled')
      RETURNING *
    `, [clinicId, campaignId]);
    return result.rows[0] || null;
  }

  async softDeleteCampaign(clinicId, campaignId, staffId) {
    const result = await this.db.query(`
      UPDATE geniusbot.campaigns
      SET deleted_at = NOW(), deleted_by_staff_id = $3, updated_at = NOW()
      WHERE clinic_id = $1
        AND id = $2
        AND deleted_at IS NULL
        AND status IN ('draft','scheduled','completed','cancelled')
      RETURNING *
    `, [clinicId, campaignId, staffId]);
    return result.rows[0] || null;
  }
}

module.exports = CampaignRepository;
