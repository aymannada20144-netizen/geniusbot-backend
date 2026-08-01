'use strict';

const { ValidationError, NotFoundError, ForbiddenError } = require('../../core/errors');
const configs = require('./resourceConfig');
const { normalizeSaudiMobile } = require('../../core/validators/saudiMobile');
const { validateUuid } = require('../../core/validators/commonValidators');
const RoomError = require('./RoomError');

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
    if (resource === 'rooms' || resource === 'branches') {
      const unknownFields = Object.keys(body).filter(
        (field) => !config.fields.includes(field)
      );
      if (unknownFields.length) {
        if (resource === 'branches') {
          throw new ValidationError(`Unsupported branch field: ${unknownFields[0]}.`);
        }
        throw new RoomError(
          'ROOM_UNKNOWN_FIELD',
          `Unsupported room field: ${unknownFields[0]}.`
        );
      }
    }
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
          if (resource === 'rooms') {
            throw new RoomError(
              `ROOM_${field.replace('room_', '').toUpperCase()}_REQUIRED`,
              `"${field}" is required.`
            );
          }
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
    if (resource === 'rooms') {
      this.validateRoomValues(config, data, partial);
    }
    if (resource === 'branches') {
      this.validateBranchValues(data, partial);
    }
    return data;
  }

  validateBranchValues(data, partial) {
    for (const field of ['name', 'city']) {
      if (!partial || Object.hasOwn(data, field)) {
        if (typeof data[field] !== 'string' || data[field].trim() === '') {
          const error = new ValidationError(
            field === 'city'
              ? 'City is required and must be a non-empty string.'
              : 'Branch name is required and must be a non-empty string.'
          );
          error.code = field === 'city' ? 'BRANCH_CITY_INVALID' : 'BRANCH_NAME_INVALID';
          throw error;
        }
      }
    }
    if (typeof data.city === 'string' && data.city.length > 80) {
      const error = new ValidationError('City must not exceed 80 characters.');
      error.code = 'BRANCH_CITY_INVALID';
      throw error;
    }
    if (data.is_active !== undefined && typeof data.is_active !== 'boolean') {
      throw new ValidationError('"is_active" must be a boolean.');
    }
  }

  validateRoomValues(config, data, partial) {
    if (data.branch_id !== undefined) {
      try {
        validateUuid(data.branch_id, 'branch_id');
      } catch {
        throw new RoomError(
          'ROOM_BRANCH_NOT_FOUND',
          'The selected branch is invalid.'
        );
      }
    }
    for (const field of ['room_number', 'room_name', 'room_type']) {
      if (!partial || Object.hasOwn(data, field)) {
        if (typeof data[field] !== 'string' || data[field].trim() === '') {
          throw new RoomError(
            `ROOM_${field.replace('room_', '').toUpperCase()}_REQUIRED`,
            `"${field}" is required.`
          );
        }
      }
    }
    if (
      data.room_type !== undefined &&
      !config.roomTypes.includes(data.room_type)
    ) {
      throw new RoomError(
        'ROOM_TYPE_INVALID',
        'The selected room type is not supported.'
      );
    }
    const limits = {
      room_number: 50,
      room_name: 255,
      room_type: 100,
    };
    for (const [field, limit] of Object.entries(limits)) {
      if (typeof data[field] === 'string' && data[field].length > limit) {
        throw new RoomError(
          `ROOM_${field.replace('room_', '').toUpperCase()}_TOO_LONG`,
          `"${field}" must not exceed ${limit} characters.`
        );
      }
    }
    if (data.is_active !== undefined && typeof data.is_active !== 'boolean') {
      throw new RoomError(
        'ROOM_ACTIVE_INVALID',
        '"is_active" must be a boolean.'
      );
    }
  }

  async assertRoomBranch(clinicId, branchId) {
    const branch = await this.repository.findBranch(branchId);
    if (!branch) {
      throw new RoomError(
        'ROOM_BRANCH_NOT_FOUND',
        'The selected branch was not found.',
        404
      );
    }
    if (branch.clinic_id !== clinicId) {
      throw new RoomError(
        'ROOM_CLINIC_MISMATCH',
        'The selected branch does not belong to the active clinic.',
        403
      );
    }
    if (branch.is_active !== true) {
      throw new RoomError(
        'ROOM_BRANCH_INACTIVE',
        'Rooms can only be assigned to an active branch.',
        409
      );
    }
    return branch;
  }

  async assertRoomCanDeactivate(roomId) {
    const usage = await this.repository.roomUsage(roomId);
    if (usage.has_active_assignments) {
      throw new RoomError(
        'ROOM_HAS_ACTIVE_ASSIGNMENTS',
        'Deactivate the active service assignments for this room first.',
        409
      );
    }
    if (usage.has_future_appointments) {
      throw new RoomError(
        'ROOM_HAS_FUTURE_APPOINTMENTS',
        'This room has pending or confirmed future appointments.',
        409
      );
    }
  }

  async assertRoomCanDelete(roomId) {
    const usage = await this.repository.roomUsage(roomId);
    if (
      usage.has_assignments ||
      usage.has_appointments ||
      usage.has_time_off
    ) {
      throw new RoomError(
        'ROOM_HARD_DELETE_FORBIDDEN',
        'A used room cannot be deleted. Deactivate it instead.',
        409
      );
    }
  }

  async assertAssignmentRoom(clinicId, data, existing = null) {
    const roomId = data.room_id ?? existing?.room_id;
    const branchId = data.branch_id ?? existing?.branch_id;
    if (!roomId) return;
    const room = await this.repository.findRoomForClinic(clinicId, roomId);
    if (!room) {
      throw new RoomError(
        'ROOM_NOT_FOUND',
        'The selected room was not found in the active clinic.',
        404
      );
    }
    if (room.is_active !== true) {
      throw new RoomError(
        'ROOM_INACTIVE',
        'An inactive room cannot be used in a service assignment.',
        409
      );
    }
    if (room.branch_id !== branchId) {
      throw new RoomError(
        'ROOM_BRANCH_MISMATCH',
        'The selected room does not belong to the assignment branch.',
        409
      );
    }
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
    if (resource === 'rooms') {
      await this.assertRoomBranch(clinicId, data.branch_id);
    }
    await this.assertParents(config, clinicId, data);
    if (resource === 'service-assignments') {
      await this.assertAssignmentRoom(clinicId, data);
    }
    return this.repository.create(config, clinicId, data);
  }

  async update(resource, clinicId, id, body) {
    const config = this.config(resource);
    const data = this.normalize(config, body, true, resource);
    const existing = await this.repository.find(config, clinicId, id);
    if (!existing) throw new NotFoundError('Master Data record not found.');
    if (resource === 'rooms') {
      if (
        data.branch_id !== undefined &&
        data.branch_id !== existing.branch_id
      ) {
        throw new RoomError(
          'ROOM_CANNOT_CHANGE_BRANCH',
          'A room cannot be moved to another branch.',
          409
        );
      }
      if (
        data.branch_id !== undefined ||
        (data.is_active === true && existing.is_active === false)
      ) {
        await this.assertRoomBranch(clinicId, existing.branch_id);
      }
      if (data.is_active === false && existing.is_active === true) {
        await this.assertRoomCanDeactivate(id);
      }
    }
    await this.assertParents(config, clinicId, data);
    if (resource === 'service-assignments') {
      await this.assertAssignmentRoom(clinicId, data, existing);
    }
    const item = await this.repository.update(config, clinicId, id, data);
    if (!item) throw new NotFoundError('Master Data record not found.');
    return item;
  }

  async remove(resource, clinicId, id) {
    const config = this.config(resource);
    if (config.singleton) throw new ValidationError('Clinic deletion is not supported.');
    if (resource === 'rooms') {
      const existing = await this.repository.find(config, clinicId, id);
      if (!existing) throw new NotFoundError('Master Data record not found.');
      await this.assertRoomCanDelete(id);
    }
    const item = await this.repository.remove(config, clinicId, id);
    if (!item) throw new NotFoundError('Master Data record not found.');
    return item;
  }
}

module.exports = MasterDataService;
