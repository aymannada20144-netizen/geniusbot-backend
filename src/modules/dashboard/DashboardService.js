const {
  NotFoundError,
} = require('../../core/errors');

const {
  validateUuid,
  validateRequired,
} = require('../../core/validators/commonValidators');
const {
  validateAppointmentTransition,
} = require('../appointments/appointmentLifecycle');

class DashboardService {
  constructor(dashboardRepository) {
    if (!dashboardRepository) {
      throw new Error('DashboardService requires dashboardRepository');
    }

    this.dashboardRepository = dashboardRepository;
  }

  async getAppointmentStats(clinicId) {
    validateUuid(clinicId, 'clinicId');

    return this.dashboardRepository.getAppointmentStats(clinicId);
  }

  async getAppointmentsList(clinicId, options = {}) {
    validateUuid(clinicId, 'clinicId');

    return this.dashboardRepository.getAppointmentsList(
      clinicId,
      options
    );
  }

  async getPatientsList(clinicId, options = {}) {
    validateUuid(clinicId, 'clinicId');

    return this.dashboardRepository.getPatientsList(
      clinicId,
      options
    );
  }

  async getTodaySchedule(clinicId) {
    validateUuid(clinicId, 'clinicId');

    const schedule =
      await this.dashboardRepository.getTodaySchedule(clinicId);

    return {
      clinicId,
      date: new Date().toISOString().slice(0, 10),
      count: schedule.length,
      schedule,
    };
  }

  async updateAppointmentStatus(
    clinicId,
    appointmentId,
    status
  ) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(appointmentId, 'appointmentId');
    validateRequired(status, 'action');

    const current = await this.dashboardRepository.findAppointmentById(
      clinicId,
      appointmentId
    );

    if (!current) {
      throw new NotFoundError('Appointment not found.');
    }

    validateAppointmentTransition(current.status, status);

    const appointment =
      await this.dashboardRepository.updateAppointmentStatus(
        clinicId,
        appointmentId,
        status
      );

    if (!appointment) {
      throw new NotFoundError('Appointment not found.');
    }

    return appointment;
  }
}

module.exports = DashboardService;
