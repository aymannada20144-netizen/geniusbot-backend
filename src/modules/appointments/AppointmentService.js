const {
  NotFoundError,
  ConflictError,
} = require('../../core/errors');

const {
  validateRequired,
  validateUuid,
} = require('../../core/validators/commonValidators');
const {
  validateAppointmentTransition,
} = require('./appointmentLifecycle');

class AppointmentService {
  constructor(appointmentRepository) {
    if (!appointmentRepository) {
      throw new Error('AppointmentService requires appointmentRepository');
    }

    this.appointmentRepository = appointmentRepository;
  }

  async listAppointments(clinicId) {
    validateUuid(clinicId, 'clinicId');

    const appointments =
      await this.appointmentRepository.findByClinicId(clinicId);

    return appointments.map((appointment) => ({
      id: appointment.id,
      patientName: appointment.patient_name,
      phoneNumber: appointment.phone_number,
      serviceName: appointment.service_name,
      doctorName: appointment.doctor_name ?? null,
      roomName: appointment.room_name ?? null,
      appointmentStart: new Date(
        appointment.appointment_start
      ).toISOString(),
      appointmentEnd:
        appointment.appointment_end == null
          ? null
          : new Date(appointment.appointment_end).toISOString(),
      paymentMethod: appointment.payment_method ?? null,
      status: appointment.status,
    }));
  }

  async updateAppointmentStatus(clinicId, appointmentId, status) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(appointmentId, 'appointmentId');

    const appointment =
      await this.appointmentRepository.findByIdAndClinic(
        clinicId,
        appointmentId
      );

    if (!appointment) {
      throw new NotFoundError('Appointment not found.');
    }

    validateAppointmentTransition(appointment.status, status);

    const updated = await this.appointmentRepository.updateStatus(
      clinicId,
      appointmentId,
      status
    );

    if (!updated) {
      throw new NotFoundError('Appointment not found.');
    }

    return {
      id: updated.id,
      status: updated.status,
    };
  }

  async getValidatedAppointment(clinicId, appointmentId, options = {}) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(appointmentId, 'appointmentId');

    const appointment =
      await this.appointmentRepository.findByIdAndClinic(
        clinicId,
        appointmentId
      );

    if (!appointment) {
      throw new NotFoundError('Appointment not found.');
    }

    const blockedStatuses = options.blockedStatuses || [];

    if (blockedStatuses.includes(appointment.status)) {
      throw new ConflictError(
        `Appointment cannot be processed because its status is ${appointment.status}.`
      );
    }

    return appointment;
  }

  async getUpcomingAppointment(clinicId, patientId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');

    const appointment =
      await this.appointmentRepository.findUpcomingByPatient(
        clinicId,
        patientId
      );

    if (!appointment) {
      throw new NotFoundError('No upcoming appointment found.');
    }

    return appointment;
  }

  async getAppointmentHistory(clinicId, patientId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');

    return this.appointmentRepository.findAppointmentHistoryByPatient(
      clinicId,
      patientId
    );
  }

  async cancelAppointment(clinicId, appointmentId, reason = null) {
  const appointment = await this.getValidatedAppointment(clinicId, appointmentId);
  validateAppointmentTransition(appointment.status, 'cancelled');

  return this.appointmentRepository.cancelAppointment(
    clinicId,
    appointment.id,
    reason
  );
}

  async completeAppointment(clinicId, appointmentId) {
    const appointment = await this.getValidatedAppointment(clinicId, appointmentId);
    validateAppointmentTransition(appointment.status, 'completed');

    return this.appointmentRepository.completeAppointment(
      clinicId,
      appointment.id
    );
  }

  async markAppointmentAsNoShow(clinicId, appointmentId) {
    const appointment = await this.getValidatedAppointment(clinicId, appointmentId);
    validateAppointmentTransition(appointment.status, 'no_show');

    return this.appointmentRepository.markAppointmentAsNoShow(
      clinicId,
      appointment.id
    );
  }

  async rescheduleAppointment(
    clinicId,
    appointmentId,
    appointmentStart,
    appointmentEnd
  ) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(appointmentId, 'appointmentId');

    validateRequired(appointmentStart, 'appointmentStart');
    validateRequired(appointmentEnd, 'appointmentEnd');

    const appointment = await this.getValidatedAppointment(clinicId, appointmentId);
    validateAppointmentTransition(appointment.status, 'rescheduled');

    const doctorConflict =
      await this.appointmentRepository.hasDoctorConflict(
        appointment.doctor_id,
        appointmentStart,
        appointmentEnd,
        appointment.id
      );

    if (doctorConflict) {
      throw new ConflictError('Doctor is not available at this time.');
    }

    const roomConflict =
      await this.appointmentRepository.hasRoomConflict(
        appointment.room_id,
        appointmentStart,
        appointmentEnd,
        appointment.id
      );

    if (roomConflict) {
      throw new ConflictError('Room is not available at this time.');
    }

    return this.appointmentRepository.updateAppointmentSchedule(
      clinicId,
      appointment.id,
      {
        appointment_start: appointmentStart,
        appointment_end: appointmentEnd,
      }
    );
  }
}

module.exports = AppointmentService;
