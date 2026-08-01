'use strict';

const { PERMISSIONS, protect, hasPermission } = require('../../core/auth');
const { ForbiddenError, ValidationError } = require('../../core/errors');
const MasterDataRepository = require('./MasterDataRepository');
const MasterDataService = require('./MasterDataService');
const DoctorWorkingHoursRepository = require('./DoctorWorkingHoursRepository');
const DoctorWorkingHoursService = require('./DoctorWorkingHoursService');
const DoctorWorkingHoursController = require('./DoctorWorkingHoursController');
const registerDoctorWorkingHoursRoutes = require('./DoctorWorkingHoursRoutes');
const ServiceAssignmentRepository = require('./ServiceAssignmentRepository');
const ServiceAssignmentService = require('./ServiceAssignmentService');
const ServiceAssignmentController = require('./ServiceAssignmentController');
const registerServiceAssignmentRoutes = require('./ServiceAssignmentRoutes');

function register({ app, db }) {
  const service = new MasterDataService(new MasterDataRepository(db));
  const workingHoursController = new DoctorWorkingHoursController(
    new DoctorWorkingHoursService(new DoctorWorkingHoursRepository(db))
  );
  registerDoctorWorkingHoursRoutes(app, workingHoursController, protect);
  registerServiceAssignmentRoutes(
    app,
    new ServiceAssignmentController(
      new ServiceAssignmentService(new ServiceAssignmentRepository(db))
    ),
    protect
  );
  const send = (reply, code, data) => reply.code(code).send({ success: true, data });
  const permissionGroups = {
    [PERMISSIONS.BRANCH_UPDATE]: ['branches', 'branch-working-hours', 'clinic-holidays'],
    [PERMISSIONS.DOCTOR_UPDATE]: ['doctors', 'specialties', 'doctor-specialties', 'doctor-working-hours', 'doctor-time-off'],
    [PERMISSIONS.ROOM_UPDATE]: ['rooms', 'room-time-off'],
    [PERMISSIONS.SERVICE_UPDATE]: ['services', 'service-pre-questions'],
    [PERMISSIONS.FINANCIAL_UPDATE]: ['payment-methods', 'insurance-companies', 'insurance-classes'],
  };
  async function authorizeWrite(request) {
    const resource = request.params.resource;
    const permission = resource === 'clinics'
      ? PERMISSIONS.CLINIC_UPDATE
      : Object.entries(permissionGroups).find(([, resources]) => resources.includes(resource))?.[0];
    if (!permission || !hasPermission(request.user.role, permission)) {
      throw new ForbiddenError('You do not have permission to manage this resource.');
    }
  }
  async function rejectPerPeriodDoctorScheduleWrite(request) {
    if (request.params.resource === 'doctor-working-hours') {
      throw new ValidationError(
        'Doctor working hours must be saved atomically through the weekly schedule endpoint.'
      );
    }
  }

  app.get('/api/clinics/:clinicId/master-data/:resource', {
    preHandler: protect(PERMISSIONS.CLINIC_VIEW),
  }, async (request, reply) => send(reply, 200, await service.list(request.params.resource, request.params.clinicId, request.query || {})));

  app.get('/api/clinics/:clinicId/master-data/:resource/:id', {
    preHandler: protect(PERMISSIONS.CLINIC_VIEW),
  }, async (request, reply) => send(reply, 200, await service.get(request.params.resource, request.params.clinicId, request.params.id)));

  app.post('/api/clinics/:clinicId/master-data/:resource', {
    preHandler: [...protect(PERMISSIONS.CLINIC_VIEW), authorizeWrite, rejectPerPeriodDoctorScheduleWrite],
  }, async (request, reply) => send(reply, 201, await service.create(request.params.resource, request.params.clinicId, request.body)));

  app.patch('/api/clinics/:clinicId/master-data/:resource/:id', {
    preHandler: [...protect(PERMISSIONS.CLINIC_VIEW), authorizeWrite, rejectPerPeriodDoctorScheduleWrite],
  }, async (request, reply) => send(reply, 200, await service.update(request.params.resource, request.params.clinicId, request.params.id, request.body)));

  app.delete('/api/clinics/:clinicId/master-data/:resource/:id', {
    preHandler: [...protect(PERMISSIONS.CLINIC_VIEW), authorizeWrite, rejectPerPeriodDoctorScheduleWrite],
  }, async (request, reply) => send(reply, 200, await service.remove(request.params.resource, request.params.clinicId, request.params.id)));
}

module.exports = { register };
