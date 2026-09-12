'use strict';

const { ValidationError, NotFoundError, ConflictError } = require('../../core/errors');
const { validateUuid, validateOptionalUuid } = require('../../core/validators/commonValidators');
const { getCampaignTemplate, listCampaignTemplates } = require('./CampaignTemplates');

const AUDIENCE_TYPES = new Set(['all', 'branch']);

class CampaignService {
  constructor(repository, communicationService, options = {}) {
    if (!repository) throw new TypeError('CampaignService requires repository.');
    if (!communicationService || typeof communicationService.send !== 'function') {
      throw new TypeError('CampaignService requires communicationService.send.');
    }
    this.repository = repository;
    this.communicationService = communicationService;
    this.logger = options.logger || console;
  }


  async setMarketingConsent(clinicId, patientId, body = {}) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.optIn !== 'boolean') {
      throw new ValidationError('optIn must be a boolean.');
    }
    const patient = await this.repository.setMarketingConsent(
      clinicId,
      patientId,
      body.optIn,
      'staff_dashboard'
    );
    if (!patient) throw new NotFoundError('Patient not found.');
    return patient;
  }

  listTemplates() {
    return listCampaignTemplates();
  }

  listCampaigns(clinicId, query = {}) {
    validateUuid(clinicId, 'clinicId');
    return this.repository.listCampaigns(clinicId, this.#normalizeListFilters(query));
  }

  async previewAudience(clinicId, body = {}) {
    validateUuid(clinicId, 'clinicId');
    const audience = this.#normalizeAudience(body);
    await this.#assertAudienceScope(clinicId, audience);
    return this.repository.previewAudience(clinicId, audience.type, audience.branchId);
  }

  async createCampaign(clinicId, staffId, body = {}) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(staffId, 'staffId');
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Campaign data is required.');
    }
    const name = this.#requiredString(body.name, 'name', 255);
    const template = getCampaignTemplate(body.templateName);
    if (!template) throw new ValidationError('Unsupported campaign template.');
    const audience = this.#normalizeAudience(body);
    await this.#assertAudienceScope(clinicId, audience);
    const variables = this.#normalizeVariables(template, body.variables || {});
    const scheduledAt = this.#normalizeSchedule(body.scheduledAt);
    const status = scheduledAt ? 'scheduled' : 'draft';
    const preview = await this.repository.previewAudience(clinicId, audience.type, audience.branchId);
    if ((preview?.eligible || 0) < 1) {
      throw new ValidationError('No eligible marketing-consented WhatsApp recipients match this audience.');
    }
    return this.repository.createCampaignWithRecipients({
      clinicId,
      createdByStaffId: staffId,
      name,
      templateName: template.name,
      templateLanguage: template.language,
      campaignKind: template.kind,
      audienceType: audience.type,
      branchId: audience.branchId,
      variables,
      status,
      scheduledAt,
    });
  }

  async updateCampaign(clinicId, campaignId, body = {}) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(campaignId, 'campaignId');
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Campaign data is required.');
    }
    const name = this.#requiredString(body.name, 'name', 255);
    const template = getCampaignTemplate(body.templateName);
    if (!template) throw new ValidationError('Unsupported campaign template.');
    const audience = this.#normalizeAudience(body);
    await this.#assertAudienceScope(clinicId, audience);
    const variables = this.#normalizeVariables(template, body.variables || {});
    const scheduledAt = this.#normalizeSchedule(body.scheduledAt);
    const status = scheduledAt ? 'scheduled' : 'draft';
    const preview = await this.repository.previewAudience(clinicId, audience.type, audience.branchId);
    if ((preview?.eligible || 0) < 1) {
      throw new ValidationError('No eligible marketing-consented WhatsApp recipients match this audience.');
    }
    const campaign = await this.repository.updateCampaignWithRecipients({
      clinicId,
      campaignId,
      name,
      templateName: template.name,
      templateLanguage: template.language,
      campaignKind: template.kind,
      audienceType: audience.type,
      branchId: audience.branchId,
      variables,
      status,
      scheduledAt,
    });
    if (campaign) return campaign;
    const existing = await this.repository.getCampaign(clinicId, campaignId);
    if (!existing) throw new NotFoundError('Campaign not found.');
    throw new ConflictError('Campaign can only be edited while it is draft or scheduled.');
  }

  async sendCampaign(clinicId, campaignId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(campaignId, 'campaignId');
    const campaign = await this.repository.claimForRun(clinicId, campaignId);
    if (!campaign) {
      const existing = await this.repository.getCampaign(clinicId, campaignId);
      if (!existing) throw new NotFoundError('Campaign not found.');
      throw new ConflictError('Campaign cannot be sent from its current status.');
    }
    await this.#executeCampaign(campaign);
    return this.repository.getCampaign(clinicId, campaignId);
  }

  async deleteCampaign(clinicId, campaignId, staffId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(campaignId, 'campaignId');
    validateUuid(staffId, 'staffId');
    const campaign = await this.repository.softDeleteCampaign(clinicId, campaignId, staffId);
    if (campaign) return campaign;
    const existing = await this.repository.getCampaignIncludingDeleted(clinicId, campaignId);
    if (!existing || existing.deleted_at) throw new NotFoundError('Campaign not found.');
    throw new ConflictError('Running campaigns cannot be deleted.');
  }

  async runDueCampaigns() {
    let processed = 0;
    while (processed < 5) {
      const campaign = await this.repository.claimNextScheduled();
      if (!campaign) break;
      await this.#executeCampaign(campaign);
      processed += 1;
    }
    return processed;
  }

  async cancelCampaign(clinicId, campaignId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(campaignId, 'campaignId');
    const campaign = await this.repository.cancelCampaign(clinicId, campaignId);
    if (!campaign) throw new ConflictError('Campaign cannot be cancelled from its current status.');
    return campaign;
  }

  async handleStatusWebhook(body) {
    const changes = Array.isArray(body?.entry)
      ? body.entry.flatMap((entry) => Array.isArray(entry?.changes) ? entry.changes : [])
      : [];
    const statuses = changes.flatMap((change) =>
      Array.isArray(change?.value?.statuses) ? change.value.statuses : []
    );
    let updated = 0;
    for (const item of statuses) {
      if (!item?.id || !item?.status) continue;
      const occurredAt = item.timestamp
        ? new Date(Number(item.timestamp) * 1000)
        : new Date();
      const firstError = Array.isArray(item.errors) ? item.errors[0] : null;
      const result = await this.repository.updateDeliveryStatus(
        item.id,
        item.status,
        occurredAt,
        firstError ? {
          code: firstError.code ? String(firstError.code) : null,
          message: firstError.title || firstError.message || firstError.error_data?.details || null,
        } : null
      );
      if (result) {
        updated += 1;
        this.#logStatusWebhook({
          outcome: 'RECIPIENT_UPDATED',
          providerMessageId: item.id,
          providerStatus: item.status,
          recipientId: result.id || null,
          campaignId: result.campaign_id || null,
          recipientStatus: result.status || null,
        });
      } else {
        this.#logStatusWebhook({
          outcome: 'RECIPIENT_NOT_FOUND',
          providerMessageId: item.id,
          providerStatus: item.status,
        });
      }
    }
    this.#logStatusWebhook({
      outcome: 'WEBHOOK_COMPLETE',
      receivedStatusCount: statuses.length,
      updatedRecipientCount: updated,
    });
    return updated;
  }

  #logStatusWebhook(entry) {
    const payload = { event: 'CAMPAIGN_STATUS_WEBHOOK', ...entry };
    if (typeof this.logger?.info === 'function') this.logger.info(payload);
  }

  async #executeCampaign(campaign) {
    const template = getCampaignTemplate(campaign.template_name);
    if (!template) {
      this.logger.error({ campaignId: campaign.id }, 'Campaign template is not registered.');
      return;
    }
    const recipients = await this.repository.listPendingRecipients(campaign.id);
    for (const recipient of recipients) {
      const payload = {
        phone: recipient.recipient_phone,
        patientName: recipient.patient_name || 'عميلنا العزيز',
        clinicId: campaign.clinic_id,
        patientId: recipient.patient_id,
        campaignId: campaign.id,
        language: template.language,
        messageType: template.name,
        ...campaign.variables,
      };
      const execution = await this.communicationService.send(template.name, payload);
      if (execution.success) {
        const providerMessageId = execution.transportResult?.messageId || null;
        if (!providerMessageId) {
          await this.repository.markRecipientFailed(recipient.id, {
            code: 'CAMPAIGN_PROVIDER_ID_MISSING',
            message: 'Meta did not return a provider message id.',
          });
          continue;
        }
        await this.repository.markRecipientSent(recipient.id, providerMessageId);
      } else {
        await this.repository.markRecipientFailed(recipient.id, execution.error);
      }
    }
    await this.repository.completeCampaign(campaign.id);
  }

  async #assertAudienceScope(clinicId, audience) {
    if (audience.type !== 'branch') return;
    if (typeof this.repository.branchBelongsToClinic !== 'function') {
      throw new TypeError('CampaignRepository.branchBelongsToClinic is required for branch audiences.');
    }
    const valid = await this.repository.branchBelongsToClinic(clinicId, audience.branchId);
    if (!valid) throw new ValidationError('branchId does not belong to this clinic.');
  }

  #normalizeAudience(body) {
    const type = typeof body.audienceType === 'string' ? body.audienceType.trim() : 'all';
    if (!AUDIENCE_TYPES.has(type)) throw new ValidationError('audienceType must be all or branch.');
    const branchId = type === 'branch'
      ? validateOptionalUuid(body.branchId, 'branchId')
      : null;
    if (type === 'branch' && !branchId) throw new ValidationError('branchId is required for branch audience.');
    return { type, branchId };
  }

  #normalizeListFilters(query) {
    if (!query || typeof query !== 'object' || Array.isArray(query)) {
      throw new ValidationError('Campaign filters must be an object.');
    }
    const search = this.#optionalString(query.search, 'search', 200);
    const status = this.#optionalString(query.status, 'status', 20);
    const templateName = this.#optionalString(query.templateName, 'templateName', 100);
    if (status && !['draft', 'scheduled', 'running', 'completed', 'cancelled'].includes(status)) {
      throw new ValidationError('status is not a supported campaign status.');
    }
    if (templateName && !getCampaignTemplate(templateName)) {
      throw new ValidationError('templateName is not a registered campaign template.');
    }
    const dateFrom = this.#normalizeFilterDate(query.dateFrom, 'dateFrom');
    const dateTo = this.#normalizeFilterDate(query.dateTo, 'dateTo');
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new ValidationError('dateFrom must be on or before dateTo.');
    }
    return { search, status, templateName, dateFrom, dateTo };
  }

  #optionalString(value, fieldName, maxLength) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') throw new ValidationError(`${fieldName} must be a string.`);
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) throw new ValidationError(`${fieldName} is too long.`);
    return normalized;
  }

  #normalizeFilterDate(value, fieldName) {
    const normalized = this.#optionalString(value, fieldName, 10);
    if (!normalized) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new ValidationError(`${fieldName} must use YYYY-MM-DD.`);
    }
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
      throw new ValidationError(`${fieldName} must be a valid date.`);
    }
    return normalized;
  }

  #normalizeVariables(template, variables) {
    if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
      throw new ValidationError('variables must be an object.');
    }
    if (template.kind === 'occasion') return {};
    return {
      offerTitle: this.#requiredString(variables.offerTitle, 'variables.offerTitle', 500),
      priceOrDiscount: this.#requiredString(variables.priceOrDiscount, 'variables.priceOrDiscount', 200),
      validUntil: this.#requiredString(variables.validUntil, 'variables.validUntil', 200),
    };
  }

  #normalizeSchedule(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') throw new ValidationError('scheduledAt must be an ISO date-time.');
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) throw new ValidationError('scheduledAt must be a valid ISO date-time.');
    if (parsed.getTime() <= Date.now()) throw new ValidationError('scheduledAt must be in the future.');
    return parsed.toISOString();
  }

  #requiredString(value, fieldName, maxLength) {
    if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${fieldName} is required.`);
    const normalized = value.trim();
    if (normalized.length > maxLength) throw new ValidationError(`${fieldName} is too long.`);
    return normalized;
  }
}

module.exports = CampaignService;
