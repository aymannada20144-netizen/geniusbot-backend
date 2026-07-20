class ServicesDashboardController {
  constructor(servicesDashboardService) {
    if (!servicesDashboardService) {
      throw new Error(
        'ServicesDashboardController requires servicesDashboardService'
      );
    }

    this.servicesDashboardService = servicesDashboardService;
  }

  async getServices(request, reply) {
    const { clinicId } = request.params;

    const data =
      await this.servicesDashboardService.getServices(clinicId);

    return reply.send({
      success: true,
      data,
    });
  }

  async getServiceById(request, reply) {
    const { clinicId, serviceId } = request.params;

    const data =
      await this.servicesDashboardService.getServiceById(
        clinicId,
        serviceId
      );

    return reply.send({
      success: true,
      data,
    });
  }
}

module.exports = ServicesDashboardController;