'use strict';

class DoctorWorkingHoursController {
  constructor(service) {
    this.service = service;
    this.getWeeklySchedule = this.getWeeklySchedule.bind(this);
    this.replaceWeeklySchedule = this.replaceWeeklySchedule.bind(this);
  }

  async getWeeklySchedule(request, reply) {
    const { clinicId, doctorId } = request.params;
    const data = await this.service.getWeeklySchedule(clinicId, doctorId);
    return reply.code(200).send({ success: true, data });
  }

  async replaceWeeklySchedule(request, reply) {
    const { clinicId, doctorId } = request.params;
    const data = await this.service.replaceWeeklySchedule(
      clinicId,
      doctorId,
      request.body
    );
    return reply.code(200).send({ success: true, data });
  }
}

module.exports = DoctorWorkingHoursController;
