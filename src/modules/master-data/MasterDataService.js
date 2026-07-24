'use strict';

const { ValidationError, NotFoundError, ForbiddenError } = require('../../core/errors');
const configs = require('./resourceConfig');
const { normalizeSaudiMobile } = require('../../core/validators/saudiMobile');

class MasterDataService {
  constructor(repository) {
    this.repository = repository;
  }

  config(resource) {
    const config = configs[resource];
    if (!config) throw new NotFoundError('Master Data resource not found.');
    return config;
  }

  normalize(config, body, partial = false, resource = '') {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Request body must be an object.');
    }
    const data = {};
    for (const field of config.fields) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      let value = body[field];
      if (typeof value === 'string') value = value.trim();
      if (value === '') value = null;
      data[field] = value;
    }
    if (!partial) {
      for (const field of config.required) {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
          throw new ValidationError(`"${field}" is required.`);
        }
      }
    }
    if (resource === 'clinics' && data.whatsapp_number !== undefined) {
      data.whatsapp_number = normalizeSaudiMobile(
        data.whatsapp_number,
        'whatsapp_number',
        true
      );
    }
    this.validateRanges(data);
    return data;
  }

  validateRanges(data) {
    const pairs = [
      ['opens_at', 'closes_at'],
      ['start_time', 'end_time'],
      ['start_datetime', 'end_datetime'],
    ];
    for (const [start, end] of pairs) {
      if (data[start] && data[end] && data[start] >= data[end]) {
        throw new ValidationError(`"${end}" must be after "${start}".`);
      }
    }
    if (data.day_of_week !== undefined && (!Number.isInteger(Number(data.day_of_week)) || Number(data.day_of_week) < 0 || Number(data.day_of_week) > 6)) {
      throw new ValidationError('"day_of_week" must be between 0 and 6.');
    }
    if (data.is_closed === false && ('opens_at' in data || 'closes_at' in data) && (!data.opens_at || !data.closes_at)) {
      throw new ValidationError('Open schedules require both opening and closing times.');
    }
  }

  async assertParents(config, clinicId, data) {
    for (const [field, table] of Object.entries(config.parentChecks || {})) {
      if (data[field] === undefined || data[field] === null) continue;
      if (!await this.repository.parentBelongsToClinic(table, data[field], clinicId)) {
        throw new ForbiddenError(`"${field}" does not belong to the active clinic.`);
      }
    }
  }

  list(resource, clinicId, query) {
    return this.repository.list(this.config(resource), clinicId, query);
  }

  async get(resource, clinicId, id) {
    const item = await this.repository.find(this.config(resource), clinicId, id);
    if (!item) throw new NotFoundError('Master Data record not found.');
    return item;
  }

  async create(resource, clinicId, body) {
    const config = this.config(resource);
    if (config.singleton) throw new ValidationError('Clinics cannot be created from a clinic-scoped session.');
    const data = this.normalize(config, body, false, resource);
    await this.assertParents(config, clinicId, data);
    return this.repository.create(config, clinicId, data);
  }

  async update(resource, clinicId, id, body) {
    const config = this.config(resource);
    const data = this.normalize(config, body, true, resource);
    await this.assertParents(config, clinicId, data);
    const item = await this.repository.update(config, clinicId, id, data);
    if (!item) throw new NotFoundError('Master Data record not found.');
    return item;
  }

  async remove(resource, clinicId, id) {
    const config = this.config(resource);
    if (config.singleton) throw new ValidationError('Clinic deletion is not supported.');
    const item = await this.repository.remove(config, clinicId, id);
    if (!item) throw new NotFoundError('Master Data record not found.');
    return item;
  }
}

module.exports = MasterDataService;
