'use strict';

const { protect } = require('../../core/auth');
const AssistantIdentityRepository = require('./AssistantIdentityRepository');
const AssistantIdentityService = require('./AssistantIdentityService');
const AssistantIdentityController = require('./AssistantIdentityController');
const registerAssistantIdentityRoutes = require('./AssistantIdentityRoutes');

function create(db) {
  const repository = new AssistantIdentityRepository(db);
  const service = new AssistantIdentityService(repository);
  return { repository, service, controller: new AssistantIdentityController(service) };
}

function register({ app, db }) {
  const composition = create(db);
  registerAssistantIdentityRoutes(app, composition.controller, protect);
  return composition;
}

module.exports = { create, register };
