'use strict';

const { validateUuid } = require('../../core/validators/commonValidators');
const ServiceAssignmentError = require('./ServiceAssignmentError');

const FIELDS = new Set([
  'branch_id', 'service_id', 'doctor_id', 'room_id', 'is_default', 'is_active',
]);

class ServiceAssignmentService {
  constructor(repository) {
    this.repository = repository;
  }

  normalize(body, partial = false) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ServiceAssignmentError(
        'SERVICE_ASSIGNMENT_BODY_INVALID',
        'Request body must be an object.',
      );
    }
    const unknown = Object.keys(body).find((field) => !FIELDS.has(field));
    if (unknown) {
      throw new ServiceAssignmentError(
        'SERVICE_ASSIGNMENT_UNKNOWN_FIELD',
        `Unsupported service assignment field: ${unknown}.`,
      );
    }
    const data = {};
    for (const field of FIELDS) {
      if (Object.hasOwn(body, field)) data[field] = body[field] === '' ? null : body[field];
    }
    if (!partial) {
      for (const field of ['branch_id', 'service_id']) {
        if (!data[field]) {
          throw new ServiceAssignmentError(
            'SERVICE_ASSIGNMENT_REQUIRED_FIELD',
            `"${field}" is required.`,
          );
        }
      }
    }
    for (const field of ['branch_id', 'service_id', 'doctor_id', 'room_id']) {
      if (data[field] !== undefined && data[field] !== null) {
        try {
          validateUuid(data[field], field);
        } catch {
          throw new ServiceAssignmentError(
            'SERVICE_ASSIGNMENT_UUID_INVALID',
            `"${field}" must be a valid UUID.`,
          );
        }
      }
    }
    for (const field of ['is_default', 'is_active']) {
      if (data[field] !== undefined && typeof data[field] !== 'boolean') {
        throw new ServiceAssignmentError(
          'SERVICE_ASSIGNMENT_BOOLEAN_INVALID',
          `"${field}" must be a boolean.`,
        );
      }
    }
    return data;
  }

  list(clinicId) {
    validateUuid(clinicId, 'clinicId');
    return this.repository.list(clinicId);
  }

  options(clinicId, branchId) {
    validateUuid(clinicId, 'clinicId');
    if (branchId) validateUuid(branchId, 'branchId');
    return this.repository.options(clinicId, branchId || null);
  }

  create(clinicId, body) {
    validateUuid(clinicId, 'clinicId');
    const data = {
      ...this.normalize(body),
      doctor_id: body.doctor_id || null,
      room_id: body.room_id || null,
      is_default: body.is_default ?? false,
      is_active: body.is_active ?? true,
    };
    return this.repository.transaction(async (client) => {
      await this.assertResources(client, clinicId, data);
      return this.repository.create(client, clinicId, data);
    });
  }

  update(clinicId, id, body) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(id, 'id');
    const patch = this.normalize(body, true);
    return this.repository.transaction(async (client) => {
      const existing = await this.repository.findForUpdate(client, clinicId, id);
      if (!existing) {
        throw new ServiceAssignmentError(
          'SERVICE_ASSIGNMENT_NOT_FOUND',
          'Service assignment was not found.',
          404,
        );
      }
      const data = { ...existing, ...patch };
      await this.assertResources(client, clinicId, data);
      return this.repository.update(client, clinicId, id, data);
    });
  }

  setActive(clinicId, id, active) {
    if (typeof active !== 'boolean') {
      throw new ServiceAssignmentError(
        'SERVICE_ASSIGNMENT_BOOLEAN_INVALID',
        '"is_active" must be a boolean.',
      );
    }
    return this.update(clinicId, id, { is_active: active });
  }

  remove(clinicId, id) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(id, 'id');
    return this.repository.transaction(async (client) => {
      const existing = await this.repository.findForUpdate(client, clinicId, id);
      if (!existing) {
        throw new ServiceAssignmentError(
          'SERVICE_ASSIGNMENT_NOT_FOUND',
          'Service assignment was not found.',
          404,
        );
      }
      if (await this.repository.hasMatchingAppointment(client, clinicId, existing)) {
        throw new ServiceAssignmentError(
          'SERVICE_ASSIGNMENT_DELETE_UNSAFE',
          'This assignment may have been used by an appointment. Deactivate it instead.',
          409,
        );
      }
      return this.repository.remove(client, clinicId, id);
    });
  }

  async assertResources(client, clinicId, data) {
    const resources = await this.repository.lockResources(client, clinicId, data);
    if (!resources.branch) {
      throw new ServiceAssignmentError(
        'SERVICE_ASSIGNMENT_BRANCH_INVALID',
        'The selected branch was not found in the active clinic.',
        404,
      );
    }
    if (!resources.service) {
      throw new ServiceAssignmentError(
        'SERVICE_ASSIGNMENT_SERVICE_INVALID',
        'The selected service was not found in the active clinic.',
        404,
      );
    }
    if (resources.service.requires_doctor && !data.doctor_id) {
      throw new ServiceAssignmentError(
        'SERVICE_ASSIGNMENT_DOCTOR_REQUIRED',
        'The selected service requires a doctor.',
      );
    }
    if (resources.service.requires_room && !data.room_id) {
      throw new ServiceAssignmentError(
        'SERVICE_ASSIGNMENT_ROOM_REQUIRED',
        'The selected service requires a room.',
      );
    }
  }
}

module.exports = ServiceAssignmentService;
