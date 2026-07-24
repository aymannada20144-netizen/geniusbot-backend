'use strict';

const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} = require('../../core/errors');
const { validateUuid } = require('../../core/validators/commonValidators');

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

class DoctorWorkingHoursService {
  constructor(repository) {
    this.repository = repository;
  }

  async getWeeklySchedule(clinicId, doctorId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(doctorId, 'doctorId');
    await this.#assertDoctor(clinicId, doctorId);
    return this.repository.list(clinicId, doctorId);
  }

  async replaceWeeklySchedule(clinicId, doctorId, body) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(doctorId, 'doctorId');
    await this.#assertDoctor(clinicId, doctorId);

    if (!body || !Array.isArray(body.periods)) {
      throw new ValidationError('periods must be an array.');
    }

    const periods = body.periods.map((period, index) =>
      this.#normalizePeriod(period, index)
    );

    this.#assertNoDuplicatesOrOverlaps(periods);

    for (const period of periods) {
      if (!await this.repository.branchBelongsToClinic(clinicId, period.branch_id)) {
        throw new ForbiddenError('A selected branch does not belong to the active clinic.');
      }
      await this.#assertWithinBranchHours(period);
    }

    return this.repository.replace(clinicId, doctorId, periods);
  }

  async #assertDoctor(clinicId, doctorId) {
    if (!await this.repository.doctorBelongsToClinic(clinicId, doctorId)) {
      throw new NotFoundError('Doctor not found in the active clinic.');
    }
  }

  #normalizePeriod(period, index) {
    if (!period || typeof period !== 'object' || Array.isArray(period)) {
      throw new ValidationError(`periods[${index}] must be an object.`);
    }

    const day = Number(period.day_of_week);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new ValidationError(`periods[${index}].day_of_week must be between 0 and 6.`);
    }

    validateUuid(period.branch_id, `periods[${index}].branch_id`);
    const start = this.#normalizeTime(period.start_time, `periods[${index}].start_time`);
    const end = this.#normalizeTime(period.end_time, `periods[${index}].end_time`);

    if (start >= end) {
      throw new ValidationError(`periods[${index}].end_time must be after start_time.`);
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
      throw new ValidationError(`${fieldName} must be a valid 24-hour time.`);
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
    for (let index = 0; index < ordered.length; index += 1) {
      const period = ordered[index];
      const key = [
        period.day_of_week,
        period.branch_id,
        period.start_time,
        period.end_time,
      ].join('|');
      if (keys.has(key)) {
        throw new ValidationError('Duplicate doctor working periods are not allowed.');
      }
      keys.add(key);

      const previous = ordered[index - 1];
      if (
        previous &&
        previous.day_of_week === period.day_of_week &&
        period.start_time < previous.end_time
      ) {
        throw new ValidationError('Doctor working periods cannot overlap, including across branches.');
      }
    }
  }

  async #assertWithinBranchHours(period) {
    const hours = await this.repository.getBranchWorkingHours(
      period.branch_id,
      period.day_of_week
    );
    if (!hours || hours.is_closed || !hours.opens_at || !hours.closes_at) {
      throw new ValidationError('The selected branch is not open during this weekday.');
    }

    const opensAt = String(hours.opens_at).slice(0, 8);
    const closesAt = String(hours.closes_at).slice(0, 8);
    if (period.start_time < opensAt || period.end_time > closesAt) {
      throw new ValidationError('Doctor working periods must be within branch opening hours.');
    }
  }
}

module.exports = DoctorWorkingHoursService;
