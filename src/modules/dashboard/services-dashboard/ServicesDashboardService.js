const {
  NotFoundError,
} = require('../../../core/errors');

const {
  validateUuid,
} = require('../../../core/validators/commonValidators');

class ServicesDashboardService {
  constructor(servicesDashboardRepository) {
    if (!servicesDashboardRepository) {
      throw new Error(
        'ServicesDashboardService requires servicesDashboardRepository'
      );
    }

    this.servicesDashboardRepository = servicesDashboardRepository;
  }

  async getServices(clinicId) {
    validateUuid(clinicId, 'clinicId');

    const services =
      await this.servicesDashboardRepository.getServices(clinicId);

    return {
      clinicId,
      count: services.length,
      services,
    };
  }

  async getServiceById(clinicId, serviceId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(serviceId, 'serviceId');

    const service =
      await this.servicesDashboardRepository.getServiceById(
        clinicId,
        serviceId
      );

    if (!service) {
      throw new NotFoundError('Service not found.');
    }

    return service;
  }
}

module.exports = ServicesDashboardService;