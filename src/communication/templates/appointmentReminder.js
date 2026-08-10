'use strict';

/**
 * ============================================================================
 * GeniusBot Communication Platform
 * Appointment Reminder Template
 * ----------------------------------------------------------------------------
 * Builds the standard message object for an appointment reminder.
 *
 * This template:
 * - Does NOT send messages.
 * - Does NOT call WhatsApp or Meta APIs.
 * - Does NOT access the database.
 * - Does NOT perform payload validation.
 *
 * Input payload is assumed to be already validated.
 * ============================================================================
 */

const MessageTypes = require('../types/MessageTypes');

/**
 * Builds an appointment reminder message.
 *
 * @param {Object} payload
 * @returns {Readonly<Object>}
 */
function buildAppointmentReminder(payload) {
    return Object.freeze({
        type: MessageTypes.APPOINTMENT_REMINDER,

        channel: 'whatsapp',

        recipient: Object.freeze({
            phone: payload.phone
        }),

        template: Object.freeze({
            name: MessageTypes.APPOINTMENT_REMINDER,

            language: payload.language || 'ar',

            variables: Object.freeze({
                patientName: payload.patientName,
                serviceName: payload.serviceName,
                doctorName: payload.doctorName,
                branchName: payload.branchName,
                roomNumber: payload.roomNumber,
                appointmentDate: payload.appointmentDate,
                appointmentTime: payload.appointmentTime,
                appointmentNumber: payload.appointmentNumber
            })
        }),

        metadata: Object.freeze({
            appointmentId: payload.appointmentId,
            patientId: payload.patientId,
            clinicId: payload.clinicId,
            priority: payload.priority || 'normal'
        })
    });
}

module.exports = buildAppointmentReminder;
