'use strict';

const { PERMISSIONS } = require('../../core/auth');

function registerCampaignRoutes(app, controller, protect) {
  const base = '/api/clinics/:clinicId/campaigns';
  app.patch('/api/clinics/:clinicId/patients/:patientId/marketing-consent', { preHandler: protect(PERMISSIONS.PATIENT_UPDATE) }, controller.setMarketingConsent.bind(controller));
  app.get(`${base}/templates`, { preHandler: protect(PERMISSIONS.NOTIFICATION_VIEW) }, controller.templates.bind(controller));
  app.get(base, { preHandler: protect(PERMISSIONS.NOTIFICATION_VIEW) }, controller.list.bind(controller));
  app.post(`${base}/audience-preview`, { preHandler: protect(PERMISSIONS.NOTIFICATION_VIEW) }, controller.preview.bind(controller));
  app.post(base, { preHandler: protect(PERMISSIONS.NOTIFICATION_SEND) }, controller.create.bind(controller));
  app.patch(`${base}/:campaignId`, { preHandler: protect(PERMISSIONS.NOTIFICATION_SEND) }, controller.update.bind(controller));
  app.delete(`${base}/:campaignId`, { preHandler: protect(PERMISSIONS.NOTIFICATION_SEND) }, controller.remove.bind(controller));
  app.post(`${base}/:campaignId/send`, { preHandler: protect(PERMISSIONS.NOTIFICATION_SEND) }, controller.send.bind(controller));
  app.post(`${base}/:campaignId/cancel`, { preHandler: protect(PERMISSIONS.NOTIFICATION_SEND) }, controller.cancel.bind(controller));
}

module.exports = registerCampaignRoutes;
