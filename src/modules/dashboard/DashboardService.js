const {
  validateUuid,
} = require('../../core/validators/commonValidators');

class DashboardService {
  constructor(dashboardRepository, appointmentService) {
    if (!dashboardRepository) {
      throw new Error('DashboardService requires dashboardRepository');
    }
    if (
      !appointmentService ||
      typeof appointmentService.updateAppointmentStatus !== 'function'
    ) {
      throw new Error(
        'DashboardService requires appointmentService'
      );
    }

    this.dashboardRepository = dashboardRepository;
    this.appointmentService = appointmentService;
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
    return this.appointmentService.updateAppointmentStatus(
      clinicId,
      appointmentId,
      status
    );
  }
}

module.exports = DashboardService;
