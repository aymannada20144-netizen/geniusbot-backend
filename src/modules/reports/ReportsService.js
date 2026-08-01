'use strict';

const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} = require('../../core/errors');
const { validateUuid } = require('../../core/validators/commonValidators');
const { isBranchManager } = require('../../core/auth/roles');

const STATUSES = Object.freeze([
  'pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show', 'rescheduled',
]);
const COMMON = Object.freeze([
  'from', 'to', 'branchId', 'city', 'serviceId', 'doctorId', 'status',
]);
const ENDPOINT_PARAMETERS = Object.freeze({
  summary: COMMON,
  trend: [...COMMON, 'groupBy'],
  breakdown: [...COMMON, 'groupBy'],
  patients: COMMON,
  conversations: COMMON,
});

class ReportsService {
  constructor(repository) {
    if (!repository) throw new Error('ReportsService requires repository.');
    this.repository = repository;
  }

  validateDate(value, field) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new ValidationError(`${field} must use YYYY-MM-DD.`);
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new ValidationError(`${field} must be a real calendar date.`);
    }
    return date;
  }

  async normalize(clinicId, query, actor, endpoint) {
    validateUuid(clinicId, 'clinicId');
    const input = query || {};
    const unknown = Object.keys(input).filter(
      (key) => !ENDPOINT_PARAMETERS[endpoint].includes(key)
    );
    if (unknown.length) {
      throw new ValidationError(`Unknown query parameter: ${unknown[0]}.`);
    }
    const fromDate = this.validateDate(input.from, 'from');
    const toDate = this.validateDate(input.to, 'to');
    if (fromDate > toDate) throw new ValidationError('from must not be after to.');
    const days = Math.floor((toDate - fromDate) / 86400000) + 1;
    if (days > 366) throw new ValidationError('Date range must not exceed 366 days.');

    const filters = { from: input.from, to: input.to };
    for (const field of ['branchId', 'serviceId', 'doctorId']) {
      if (input[field] !== undefined) {
        validateUuid(input[field], field);
        filters[field] = input[field];
      }
    }
    if (input.city !== undefined) {
      if (typeof input.city !== 'string' || !input.city.trim()) {
        throw new ValidationError('city must be a non-empty string.');
      }
      filters.city = input.city.trim();
    }
    if (input.status !== undefined) {
      if (!STATUSES.includes(input.status)) {
        throw new ValidationError('Unsupported appointment status.');
      }
      filters.status = input.status;
    }
    if (endpoint === 'trend') {
      filters.groupBy = input.groupBy || 'day';
      if (!['day', 'week'].includes(filters.groupBy)) {
        throw new ValidationError('groupBy must be day or week.');
      }
    }
    if (endpoint === 'breakdown') {
      filters.groupBy = input.groupBy;
      if (!['city', 'branch', 'service', 'doctor', 'status', 'source'].includes(filters.groupBy)) {
        throw new ValidationError('Unsupported breakdown groupBy.');
      }
    }
    if (isBranchManager(actor?.role)) {
      if (!actor.branchId) {
        throw new ForbiddenError('Branch manager must be assigned to a branch.');
      }
      validateUuid(actor.branchId, 'actor.branchId');
      if (filters.branchId && filters.branchId !== actor.branchId) {
        throw new ForbiddenError('Branch managers can only view their assigned branch.');
      }
      filters.branchId = actor.branchId;
    }
    const timezone = await this.repository.getClinicTimezone(clinicId);
    if (!timezone) throw new NotFoundError('Clinic reporting context was not found.');
    for (const [field, resource] of [
      ['branchId', 'branch'], ['serviceId', 'service'], ['doctorId', 'doctor'],
    ]) {
      if (
        filters[field] &&
        !(await this.repository.resourceBelongsToClinic(resource, clinicId, filters[field]))
      ) {
        throw new ValidationError(`${field} does not belong to this clinic.`);
      }
    }
    return { filters, timezone };
  }

  meta(filters, timezone) {
    const { from, to, groupBy, ...applied } = filters;
    return { from, to, timezone, filters: applied, ...(groupBy ? { groupBy } : {}) };
  }

  rates(row) {
    const total = Number(row.total ?? row.count);
    const rate = (value) => total === 0 ? null : Number(((Number(value) / total) * 100).toFixed(2));
    return {
      completionRate: rate(row.completed),
      cancellationRate: rate(row.cancelled),
      noShowRate: rate(row.no_show),
    };
  }

  async appointmentSummary(clinicId, query, actor) {
    const context = await this.normalize(clinicId, query, actor, 'summary');
    const row = await this.repository.getAppointmentSummary(
      clinicId, context.timezone, context.filters
    );
    return {
      data: {
        total: Number(row.total), pending: Number(row.pending),
        confirmed: Number(row.confirmed), checkedIn: Number(row.checked_in),
        completed: Number(row.completed),
        cancelled: Number(row.cancelled), noShow: Number(row.no_show),
        rescheduled: Number(row.rescheduled), ...this.rates(row),
      },
      meta: this.meta(context.filters, context.timezone),
    };
  }

  async appointmentTrend(clinicId, query, actor) {
    const context = await this.normalize(clinicId, query, actor, 'trend');
    const rows = await this.repository.getAppointmentTrend(
      clinicId, context.timezone, context.filters, context.filters.groupBy
    );
    return {
      data: rows.map((row) => ({
        periodStart: row.period_start,
        appointments: Number(row.appointments),
        newBookings: Number(row.new_bookings),
      })),
      meta: this.meta(context.filters, context.timezone),
    };
  }

  async appointmentBreakdown(clinicId, query, actor) {
    const context = await this.normalize(clinicId, query, actor, 'breakdown');
    const rows = await this.repository.getAppointmentBreakdown(
      clinicId, context.timezone, context.filters, context.filters.groupBy
    );
    return {
      data: rows.map((row) => ({
        resourceId: row.resource_id,
        label: row.label,
        count: Number(row.count),
        checkedIn: Number(row.checked_in),
        completed: Number(row.completed),
        cancelled: Number(row.cancelled),
        noShow: Number(row.no_show),
        rescheduled: Number(row.rescheduled),
        ...this.rates(row),
      })),
      meta: this.meta(context.filters, context.timezone),
    };
  }

  async patientSummary(clinicId, query, actor) {
    const context = await this.normalize(clinicId, query, actor, 'patients');
    const row = await this.repository.getPatientSummary(
      clinicId, context.timezone, context.filters
    );
    return {
      data: {
        newPatientRecords: Number(row.new_patient_records),
        patientsWithAppointments: Number(row.patients_with_appointments),
        firstTimeBookedPatients: Number(row.first_time_booked_patients),
        returningBookedPatients: Number(row.returning_booked_patients),
      },
      meta: this.meta(context.filters, context.timezone),
    };
  }

  async conversationSummary(clinicId, query, actor) {
    const context = await this.normalize(clinicId, query, actor, 'conversations');
    const row = await this.repository.getConversationSummary(
      clinicId, context.timezone, context.filters
    );
    return {
      data: {
        totalConversations: Number(row.total_conversations),
        humanTakeovers: Number(row.human_takeovers),
        aiPresentConversations: Number(row.ai_present_conversations),
      },
      meta: this.meta(context.filters, context.timezone),
    };
  }
}

module.exports = ReportsService;
