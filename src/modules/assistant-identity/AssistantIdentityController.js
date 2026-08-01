'use strict';

class AssistantIdentityController {
  constructor(service) {
    this.service = service;
  }

  async get(request, reply) {
    return reply.send({ success: true, data: await this.service.get(request.params.clinicId) });
  }

  async update(request, reply) {
    return reply.send({ success: true, data: await this.service.update(request.params.clinicId, request.body) });
  }
}

module.exports = AssistantIdentityController;
