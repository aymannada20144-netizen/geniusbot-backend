'use strict';

const { protect } = require('../../core/auth');
const PriceRepository = require('../../repositories/PriceRepository');
const PriceService = require('../../services/PriceService');
const PriceController = require('./PriceController');
const registerPriceRoutes = require('./PriceRoutes');

function register({ app, db }) {
  const repository = new PriceRepository(db);
  const service = new PriceService(repository);
  const controller = new PriceController(service);
  registerPriceRoutes(app, controller, protect);
  return { repository, service, controller };
}

module.exports = { register };
