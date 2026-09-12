'use strict';

const { getCampaignTemplate } = require('../../modules/campaigns/CampaignTemplates');

function buildCampaignMarketing(payload) {
  const template = getCampaignTemplate(payload.messageType);
  if (!template) {
    throw new TypeError(`Unsupported campaign message type: ${String(payload.messageType)}`);
  }
  const variables = {};
  for (const variable of template.variables) {
    if (variable === 'patientName') variables.patientName = payload.patientName;
    if (variable === 'offerTitle') variables.offerTitle = payload.offerTitle;
    if (variable === 'priceOrDiscount') variables.priceOrDiscount = payload.priceOrDiscount;
    if (variable === 'validUntil') variables.validUntil = payload.validUntil;
  }
  return Object.freeze({
    type: template.name,
    channel: 'whatsapp',
    recipient: Object.freeze({ phone: payload.phone }),
    template: Object.freeze({
      name: template.name,
      language: payload.language || template.language,
      variables: Object.freeze(variables),
    }),
    metadata: Object.freeze({
      clinicId: payload.clinicId,
      patientId: payload.patientId,
      campaignId: payload.campaignId,
      priority: payload.priority || 'normal',
    }),
  });
}

module.exports = buildCampaignMarketing;
