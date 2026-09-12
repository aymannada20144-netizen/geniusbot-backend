'use strict';

const CAMPAIGN_TEMPLATES = Object.freeze({
  saudi_national_day: Object.freeze({
    name: 'saudi_national_day',
    label: 'Saudi National Day',
    category: 'marketing',
    language: 'ar',
    kind: 'occasion',
    variables: Object.freeze(['patientName']),
  }),
  saudi_foundation_day: Object.freeze({
    name: 'saudi_foundation_day',
    label: 'Saudi Foundation Day',
    category: 'marketing',
    language: 'ar',
    kind: 'occasion',
    variables: Object.freeze(['patientName']),
  }),
  eid_al_fitr: Object.freeze({
    name: 'eid_al_fitr',
    label: 'Eid Al-Fitr',
    category: 'marketing',
    language: 'ar',
    kind: 'occasion',
    variables: Object.freeze(['patientName']),
  }),
  eid_al_adha: Object.freeze({
    name: 'eid_al_adha',
    label: 'Eid Al-Adha',
    category: 'marketing',
    language: 'ar',
    kind: 'occasion',
    variables: Object.freeze(['patientName']),
  }),
  special_offer: Object.freeze({
    name: 'special_offer',
    label: 'Special Offer',
    category: 'marketing',
    language: 'ar',
    kind: 'offer',
    variables: Object.freeze([
      'patientName',
      'offerTitle',
      'priceOrDiscount',
      'validUntil',
    ]),
  }),
});

function getCampaignTemplate(name) {
  return CAMPAIGN_TEMPLATES[name] || null;
}

function listCampaignTemplates() {
  return Object.values(CAMPAIGN_TEMPLATES);
}

module.exports = {
  CAMPAIGN_TEMPLATES,
  getCampaignTemplate,
  listCampaignTemplates,
};
