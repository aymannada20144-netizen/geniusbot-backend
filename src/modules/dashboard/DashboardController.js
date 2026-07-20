class DashboardController {
  constructor(dashboardService) {
    if (!dashboardService) {
      throw new Error('DashboardController requires dashboardService');
    }

    this.dashboardService = dashboardService;
  }

  async getAppointmentStats(request, reply) {
    const { clinicId } = request.params;

    const stats =
      await this.dashboardService.getAppointmentStats(clinicId);

    return reply.send({
      success: true,
      data: stats,
    });
  }

  async getAppointmentsList(request, reply) {
    const { clinicId } = request.params;
    const { limit, offset } = request.query;

    const appointments =
      await this.dashboardService.getAppointmentsList(
        clinicId,
        {
          limit,
          offset,
        }
      );

    return reply.send({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  }

  async getPatientsList(request, reply) {
    const { clinicId } = request.params;
    const { limit, offset } = request.query;

    const patients =
      await this.dashboardService.getPatientsList(
        clinicId,
        {
          limit,
          offset,
        }
      );

    return reply.send({
      success: true,
      count: patients.length,
      data: patients,
    });
  }

  async getTodaySchedule(request, reply) {
    const { clinicId } = request.params;

    const schedule =
      await this.dashboardService.getTodaySchedule(clinicId);

    return reply.send({
      success: true,
      data: schedule,
    });
  }

  async updateAppointmentAction(request, reply) {
    const { clinicId, appointmentId } = request.params;
    const { action } = request.body || {};

    const appointment =
      await this.dashboardService.updateAppointmentStatus(
        clinicId,
        appointmentId,
        action
      );

    return reply.send({
      success: true,
      data: appointment,
    });
  }
}

module.exports = DashboardController;