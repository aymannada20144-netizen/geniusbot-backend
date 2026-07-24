'use strict';

class StaffController {
  constructor(staffService) {
    if (!staffService) {
      throw new TypeError(
        'staffService is required.'
      );
    }

    this.staffService = staffService;

    this.login = this.login.bind(this);
    this.create = this.create.bind(this);
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.update = this.update.bind(this);
    this.changeRole = this.changeRole.bind(this);
    this.remove = this.remove.bind(this);
    this.setActiveStatus =
      this.setActiveStatus.bind(this);
    this.changeOwnPassword =
      this.changeOwnPassword.bind(this);
    this.resetPassword =
      this.resetPassword.bind(this);
    this.transferOwnership =
      this.transferOwnership.bind(this);
  }

  async login(request, reply) {
    const body = request.body || {};

    const result = await this.staffService.login(
      body.identifier,
      body.password
    );

    return reply.code(200).send({
      success: true,
      data: result,
    });
  }

  async create(request, reply) {
    const actor = this.#getActor(request);
    const { clinicId } = request.params;

    const staff = await this.staffService.create(
      actor,
      clinicId,
      request.body || {}
    );

    return reply.code(201).send({
      success: true,
      data: staff,
    });
  }

  async list(request, reply) {
    const actor = this.#getActor(request);
    const { clinicId } = request.params;

    const staff = await this.staffService.listByClinic(
      actor,
      clinicId,
      request.query || {}
    );

    return reply.code(200).send({
      success: true,
      data: staff,
    });
  }

  async getById(request, reply) {
    const actor = this.#getActor(request);
    const { clinicId, staffId } = request.params;

    const staff = await this.staffService.getById(
      actor,
      clinicId,
      staffId
    );

    return reply.code(200).send({
      success: true,
      data: staff,
    });
  }

  async update(request, reply) {
    const actor = this.#getActor(request);
    const { clinicId, staffId } = request.params;

    const staff = await this.staffService.update(
      actor,
      clinicId,
      staffId,
      request.body || {}
    );

    return reply.code(200).send({
      success: true,
      data: staff,
    });
  }

  async changeRole(request, reply) {
    const actor = this.#getActor(request);
    const { clinicId, staffId } = request.params;
    const body = request.body || {};

    const staff =
      await this.staffService.changeRole(
        actor,
        clinicId,
        staffId,
        body.role,
        body.branchId ?? body.branch_id ?? null
      );

    return reply.code(200).send({
      success: true,
      data: staff,
    });
  }

  async remove(request, reply) {
    const actor = this.#getActor(request);
    const { clinicId, staffId } = request.params;
    const staff = await this.staffService.remove(actor, clinicId, staffId);
    return reply.code(200).send({ success: true, data: staff });
  }

  async setActiveStatus(request, reply) {
    const actor = this.#getActor(request);
    const { clinicId, staffId } = request.params;
    const body = request.body || {};

    const isActive =
      body.isActive ?? body.is_active;

    const staff =
      await this.staffService.setActiveStatus(
        actor,
        clinicId,
        staffId,
        isActive
      );

    return reply.code(200).send({
      success: true,
      data: staff,
    });
  }

  async changeOwnPassword(request, reply) {
    const actor = this.#getActor(request);
    const body = request.body || {};

    const result = await this.staffService.changeOwnPassword(
      actor,
      body.currentPassword ?? body.current_password,
      body.newPassword ?? body.new_password,
      body.confirmPassword ?? body.confirm_password
    );

    return reply.code(200).send({
      success: true,
      data: result,
    });
  }

  async resetPassword(request, reply) {
    const actor = this.#getActor(request);
    const { clinicId, staffId } = request.params;
    const body = request.body || {};

    const result = await this.staffService.resetPassword(
      actor,
      clinicId,
      staffId,
      body.newPassword ?? body.new_password,
      body.confirmPassword ?? body.confirm_password
    );

    return reply.code(200).send({ success: true, data: result });
  }

  async transferOwnership(request, reply) {
    const actor = this.#getActor(request);
    const { clinicId } = request.params;
    const body = request.body || {};

    const result =
      await this.staffService.transferOwnership(
        actor,
        clinicId,
        body.newOwnerStaffId ??
          body.new_owner_staff_id
      );

    return reply.code(200).send({
      success: true,
      data: result,
    });
  }

  #getActor(request) {
    const user = request.user || {};

    return {
      id: user.id || user.sub,
      clinicId:
        user.clinicId ?? user.clinic_id ?? null,
      branchId:
        user.branchId ?? user.branch_id ?? null,
      role: user.role,
    };
  }
}

module.exports = StaffController;
