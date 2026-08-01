'use strict';

class ReportsController {
  constructor(service) {
    if (!service) throw new Error('ReportsController requires service.');
    this.service = service;
  }

  async respond(request, reply, method) {
    const result = await this.service[method](
      request.params.clinicId, request.query, request.user
    );
    return reply.send({ success: true, ...result });
  }

  summary(request, reply) {
    return this.respond(request, reply, 'appointmentSummary');
  }

  trend(request, reply) {
    return this.respond(request, reply, 'appointmentTrend');
  }

  breakdown(request, reply) {
    return this.respond(request, reply, 'appointmentBreakdown');
  }

  patients(request, reply) {
    return this.respond(request, reply, 'patientSummary');
  }

  conversations(request, reply) {
    return this.respond(request, reply, 'conversationSummary');
  }
}

module.exports = ReportsController;
