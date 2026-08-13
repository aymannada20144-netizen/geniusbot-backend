'use strict';

const MessageTypes = require('../types/MessageTypes');

function buildAppointmentCancelled(payload) {
  return Object.freeze({
    type: MessageTypes.APPOINTMENT_CANCELLED,
    channel: 'whatsapp',
    recipient: Object.freeze({ phone: payload.phone }),
    template: Object.freeze({
      name: MessageTypes.APPOINTMENT_CANCELLED,
      language: payload.language || 'ar',
      variables: Object.freeze({
        patientName: payload.patientName,
        appointmentNumber: payload.appointmentNumber,
        serviceName: payload.serviceName,
        branchName: payload.branchName,
        appointmentDate: payload.appointmentDate,
        appointmentTime: payload.appointmentTime,
      }),
    }),
    metadata: Object.freeze({
      appointmentId: payload.appointmentId,
      patientId: payload.patientId,
      clinicId: payload.clinicId,
      priority: payload.priority || 'normal',
    }),
  });
}

module.exports = buildAppointmentCancelled;
