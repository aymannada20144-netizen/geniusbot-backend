'use strict';

const { PERMISSIONS } = require('../../core/auth/permissions');

function registerAssistantIdentityRoutes(app, controller, protect) {
  const path = '/api/clinics/:clinicId/assistant-identity';
  app.get(path, { preHandler: protect(PERMISSIONS.AI_SETTINGS_VIEW) }, controller.get.bind(controller));
  app.put(path, { preHandler: protect(PERMISSIONS.AI_SETTINGS_UPDATE) }, controller.update.bind(controller));
}

module.exports = registerAssistantIdentityRoutes;
