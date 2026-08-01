'use strict';

class DoctorWorkingHoursController {
  constructor(service) {
    this.service = service;
    this.getWeeklySchedule = this.getWeeklySchedule.bind(this);
    this.replaceWeeklySchedule = this.replaceWeeklySchedule.bind(this);
  }

  async getWeeklySchedule(request, reply) {
    const { clinicId, doctorId } = request.params;
    const schedule = await this.service.getWeeklySchedule(clinicId, doctorId);
    return reply.code(200).send({
      success: true,
      data: schedule.periods,
      meta: { version: schedule.version },
    });
  }

  async replaceWeeklySchedule(request, reply) {
    const { clinicId, doctorId } = request.params;
    const schedule = await this.service.replaceWeeklySchedule(
      clinicId,
      doctorId,
      request.body
    );
    return reply.code(200).send({
      success: true,
      data: schedule.periods,
      meta: { version: schedule.version },
    });
  }
}

module.exports = DoctorWorkingHoursController;
