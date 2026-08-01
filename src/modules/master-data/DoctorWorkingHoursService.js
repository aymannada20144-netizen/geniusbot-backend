'use strict';

const { validateUuid } = require('../../core/validators/commonValidators');
const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} = require('../../core/errors');

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ROOT_FIELDS = new Set(['periods', 'version']);
const PERIOD_FIELDS = new Set([
  'branch_id',
  'day_of_week',
  'start_time',
  'end_time',
]);

class DoctorWorkingHoursService {
  constructor(repository) {
    this.repository = repository;
  }

  async getWeeklySchedule(clinicId, doctorId) {
    this.#validateUuid(clinicId, 'clinicId');
    this.#validateUuid(doctorId, 'doctorId');
    await this.#assertDoctor(clinicId, doctorId);
    return this.repository.getWeeklySchedule(clinicId, doctorId);
  }

  async replaceWeeklySchedule(clinicId, doctorId, body) {
    this.#validateUuid(clinicId, 'clinicId');
    this.#validateUuid(doctorId, 'doctorId');
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_INVALID_PAYLOAD',
        'The request body must be an object.',
      );
    }
    this.#assertAllowedFields(body, ROOT_FIELDS, 'request body');

    if (!Array.isArray(body.periods)) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_INVALID_PAYLOAD',
        'periods must be an array.',
      );
    }
    if (typeof body.version !== 'string' || !/^[a-f0-9]{64}$/.test(body.version)) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_VERSION_REQUIRED',
        'A valid schedule version is required.',
      );
    }

    const periods = body.periods.map((period, index) =>
      this.#normalizePeriod(period, index)
    );

    this.#assertNoDuplicatesOrOverlaps(periods);

    for (const period of periods) {
      await this.#assertBranch(clinicId, period.branch_id);
      await this.#assertWithinBranchHours(clinicId, period);
    }

    const result = await this.repository.replace(
      clinicId,
      doctorId,
      periods,
      body.version,
    );
    if (!result.doctor && result.doctor === null) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_DOCTOR_NOT_FOUND',
        'Doctor not found in the active clinic.',
        404,
      );
    }
    if (result.doctorInactive) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_DOCTOR_INACTIVE',
        'The selected doctor is inactive.',
        409,
      );
    }
    if (result.versionConflict) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_VERSION_CONFLICT',
        'The schedule changed after it was loaded. Reload and try again.',
        409,
      );
    }
    return result;
  }

  async #assertDoctor(clinicId, doctorId) {
    const doctor = await this.repository.findDoctorScope(clinicId, doctorId);
    if (!doctor) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_DOCTOR_NOT_FOUND',
        'Doctor not found in the active clinic.',
        404,
      );
    }
    if (doctor.is_active !== true) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_DOCTOR_INACTIVE',
        'The selected doctor is inactive.',
        409,
      );
    }
  }

  async #assertBranch(clinicId, branchId) {
    const branch = await this.repository.findBranchScope(clinicId, branchId);
    if (!branch) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_BRANCH_NOT_FOUND',
        'The selected branch does not belong to the active clinic.',
        403,
      );
    }
    if (branch.is_active !== true) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_BRANCH_INACTIVE',
        'The selected branch is inactive.',
        409,
      );
    }
  }

  #normalizePeriod(period, index) {
    if (!period || typeof period !== 'object' || Array.isArray(period)) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_INVALID_PAYLOAD',
        `periods[${index}] must be an object.`,
      );
    }
    this.#assertAllowedFields(period, PERIOD_FIELDS, `periods[${index}]`);

    const day = period.day_of_week;
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_INVALID_DAY',
        `periods[${index}].day_of_week must be an integer between 0 and 6.`,
      );
    }

    this.#validateUuid(period.branch_id, `periods[${index}].branch_id`);
    const start = this.#normalizeTime(period.start_time, `periods[${index}].start_time`);
    const end = this.#normalizeTime(period.end_time, `periods[${index}].end_time`);

    if (start >= end) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_INVALID_TIME_RANGE',
        `periods[${index}].end_time must be after start_time.`,
      );
    }

    return {
      branch_id: period.branch_id,
      day_of_week: day,
      start_time: start,
      end_time: end,
    };
  }

  #normalizeTime(value, fieldName) {
    if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_INVALID_TIME_RANGE',
        `${fieldName} must use HH:mm in 24-hour time.`,
      );
    }
    return `${value.slice(0, 5)}:00`;
  }

  #assertNoDuplicatesOrOverlaps(periods) {
    const ordered = [...periods].sort((left, right) =>
      left.day_of_week - right.day_of_week ||
      left.start_time.localeCompare(right.start_time) ||
      left.end_time.localeCompare(right.end_time) ||
      left.branch_id.localeCompare(right.branch_id)
    );

    const keys = new Set();
    let activeDay = null;
    let furthestEnd = null;
    for (let index = 0; index < ordered.length; index += 1) {
      const period = ordered[index];
      const key = [
        period.day_of_week,
        period.branch_id,
        period.start_time,
        period.end_time,
      ].join('|');
      if (keys.has(key)) {
        throw this.#error(
          'DOCTOR_WORKING_HOURS_OVERLAP',
          'Duplicate doctor working periods are not allowed.',
          409,
        );
      }
      keys.add(key);

      if (activeDay !== period.day_of_week) {
        activeDay = period.day_of_week;
        furthestEnd = period.end_time;
        continue;
      }
      if (period.start_time < furthestEnd) {
        throw this.#error(
          'DOCTOR_WORKING_HOURS_OVERLAP',
          'Doctor working periods cannot overlap, including across branches.',
          409,
        );
      }
      if (period.end_time > furthestEnd) furthestEnd = period.end_time;
    }
  }

  async #assertWithinBranchHours(clinicId, period) {
    const hours = await this.repository.getBranchWorkingHours(
      clinicId,
      period.branch_id,
      period.day_of_week
    );
    if (!hours || hours.is_closed || !hours.opens_at || !hours.closes_at) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_OUTSIDE_BRANCH_HOURS',
        'The selected branch is not open during this weekday.',
      );
    }

    const opensAt = String(hours.opens_at).slice(0, 8);
    const closesAt = String(hours.closes_at).slice(0, 8);
    if (period.start_time < opensAt || period.end_time > closesAt) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_OUTSIDE_BRANCH_HOURS',
        'Doctor working periods must be within branch opening hours.',
      );
    }
  }

  #assertAllowedFields(value, allowed, label) {
    const unknown = Object.keys(value).filter((field) => !allowed.has(field));
    if (unknown.length > 0) {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_UNKNOWN_FIELD',
        `${label} contains unsupported fields: ${unknown.join(', ')}.`,
      );
    }
  }

  #validateUuid(value, fieldName) {
    try {
      validateUuid(value, fieldName);
    } catch {
      throw this.#error(
        'DOCTOR_WORKING_HOURS_INVALID_UUID',
        `${fieldName} must be a valid UUID.`,
      );
    }
  }

  #error(code, message, statusCode = 400) {
    const ErrorClass = statusCode === 404
      ? NotFoundError
      : statusCode === 403
        ? ForbiddenError
        : statusCode === 409
          ? ConflictError
          : ValidationError;
    const error = new ErrorClass(message);
    error.code = code;
    return error;
  }
}

module.exports = DoctorWorkingHoursService;
