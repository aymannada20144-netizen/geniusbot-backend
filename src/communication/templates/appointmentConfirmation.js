'use strict';

const MessageTypes = require('../types/MessageTypes');

function buildAppointmentConfirmation(payload) {

    return Object.freeze({

        type: MessageTypes.APPOINTMENT_CONFIRMATION,

        channel: 'whatsapp',

        recipient: Object.freeze({
            phone: payload.phone
        }),

        template: Object.freeze({

            name: MessageTypes.APPOINTMENT_CONFIRMATION,

            language: payload.language || 'ar',

            variables: Object.freeze({

                patientName: payload.patientName,

                serviceName: payload.serviceName,

                doctorName: payload.doctorName,

                branchName: payload.branchName,

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

module.exports = buildAppointmentConfirmation;