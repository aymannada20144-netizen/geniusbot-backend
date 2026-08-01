'use strict';

class ServiceAssignmentController {
  constructor(service) {
    this.service = service;
    this.list = this.list.bind(this);
    this.options = this.options.bind(this);
    this.create = this.create.bind(this);
    this.update = this.update.bind(this);
    this.setActive = this.setActive.bind(this);
    this.remove = this.remove.bind(this);
  }

  send(reply, statusCode, data) {
    return reply.code(statusCode).send({ success: true, data });
  }

  async list(request, reply) {
    return this.send(reply, 200, await this.service.list(request.params.clinicId));
  }

  async options(request, reply) {
    return this.send(
      reply,
      200,
      await this.service.options(request.params.clinicId, request.query?.branchId),
    );
  }

  async create(request, reply) {
    return this.send(
      reply,
      201,
      await this.service.create(request.params.clinicId, request.body),
    );
  }

  async update(request, reply) {
    return this.send(
      reply,
      200,
      await this.service.update(request.params.clinicId, request.params.id, request.body),
    );
  }

  async setActive(request, reply) {
    return this.send(
      reply,
      200,
      await this.service.setActive(
        request.params.clinicId,
        request.params.id,
        request.body?.is_active,
      ),
    );
  }

  async remove(request, reply) {
    return this.send(
      reply,
      200,
      await this.service.remove(request.params.clinicId, request.params.id),
    );
  }
}

module.exports = ServiceAssignmentController;
