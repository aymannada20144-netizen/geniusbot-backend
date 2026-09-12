'use strict';

const CampaignRepository = require('./CampaignRepository');
const CampaignService = require('./CampaignService');
const CampaignController = require('./CampaignController');
const CampaignScheduler = require('./CampaignScheduler');
const registerCampaignRoutes = require('./CampaignRoutes');
const { protect } = require('../../core/auth');

function register({ app, db, communicationService }) {
  const repository = new CampaignRepository(db);
  const service = new CampaignService(repository, communicationService, { logger: app.log });
  const controller = new CampaignController(service);
  const scheduler = new CampaignScheduler(service, { logger: app.log });
  registerCampaignRoutes(app, controller, protect);
  return { repository, service, scheduler };
}

module.exports = { register };
