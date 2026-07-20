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
        request.body
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
}

module.exports = PatientController;