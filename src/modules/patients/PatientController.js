class PatientController {
  constructor(patientService) {
    if (!patientService) {
      throw new Error(
        'PatientController requires patientService'
      );
    }

    this.patientService = patientService;
  }

  async getPatient(request, reply) {
    const { clinicId, patientId } = request.params;

    const patient =
      await this.patientService.getPatientById(
        clinicId,
        patientId
      );

    return reply.send({
      success: true,
      data: patient,
    });
  }

  async searchPatients(request, reply) {
    const { clinicId } = request.params;

    const {
      search,
      limit,
      offset,
    } = request.query;

    const patients =
      await this.patientService.searchPatients(
        clinicId,
        {
          search,
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

  async createPatient(request, reply) {
    const patient =
      await this.patientService.createPatient(
        request.params.clinicId,
        request.body || {}
      );

    return reply.code(201).send({
      success: true,
      data: patient,
    });
  }

  async deactivatePatient(request, reply) {
    const { clinicId, patientId } = request.params;

    const patient =
      await this.patientService.deactivate(
        clinicId,
        patientId
      );

    return reply.send({
      success: true,
      data: patient,
    });
  }

  async reactivatePatient(request, reply) {
    const { clinicId, patientId } = request.params;

    const patient =
      await this.patientService.reactivate(
        clinicId,
        patientId
      );

    return reply.send({
      success: true,
      data: patient,
    });
  }

  async updateLastSeen(request, reply) {
    const { clinicId, patientId } = request.params;

    const patient =
      await this.patientService.updateLastSeen(
        clinicId,
        patientId
      );

    return reply.send({
      success: true,
      data: patient,
    });
  }

  async setPatientStatus(request, reply) {
    const patient = await this.patientService.setActiveStatus(
      request.params.clinicId,
      request.params.patientId,
      request.body
    );
    return reply.send({ success: true, data: patient });
  }

  async deletePatient(request, reply) {
    const patient = await this.patientService.deletePatient(
      request.params.clinicId,
      request.params.patientId
    );
    return reply.send({ success: true, data: patient });
  }

  async updatePatient(request, reply) {
    const { clinicId, patientId } = request.params;
    const patient = await this.patientService.updatePatient(
      clinicId,
      patientId,
      request.body || {}
    );
    return reply.send({ success: true, data: patient });
  }

  async getAppointments(request, reply) {
    const { clinicId, patientId } = request.params;
    const appointments = await this.patientService.getAppointments(
      clinicId,
      patientId
    );
    return reply.send({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  }

  async getConversation(request, reply) {
    const { clinicId, patientId } = request.params;
    return reply.send({ success: true, data: await this.patientService.getConversation(clinicId, patientId) });
  }

  async takeOver(request, reply) {
    const { clinicId, conversationId } = request.params;
    return reply.send({ success: true, data: await this.patientService.takeOver(clinicId, conversationId, request.user.id) });
  }

  async startHumanConversation(request, reply) {
    const { clinicId, patientId } = request.params;
    return reply.send({ success: true, data: await this.patientService.startHumanConversation(clinicId, patientId, request.user.id) });
  }

  async returnToShaden(request, reply) {
    const { clinicId, conversationId } = request.params;
    return reply.send({ success: true, data: await this.patientService.returnToShaden(clinicId, conversationId) });
  }

  async sendHumanMessage(request, reply) {
    const { clinicId, conversationId } = request.params;
    return reply.send({ success: true, data: await this.patientService.sendHumanMessage(clinicId, conversationId, request.user.id, request.body?.body) });
  }
}

module.exports = PatientController;
