'use strict';

/**
 * ============================================================================
 * GeniusBot Communication Platform
 * Thank You Template
 * ----------------------------------------------------------------------------
 * Builds the standard message object for a thank-you message sent after
 * the patient's visit.
 *
 * Input payload is assumed to be already validated.
 * ============================================================================
 */

const MessageTypes = require('../types/MessageTypes');

function buildThankYou(payload) {

    return Object.freeze({

        type: MessageTypes.THANK_YOU,

        channel: 'whatsapp',

        recipient: Object.freeze({
            phone: payload.phone
        }),

        template: Object.freeze({

            name: MessageTypes.THANK_YOU,

            language: payload.language || 'ar',

            variables: Object.freeze({

                patientName: payload.patientName,

                clinicName: payload.clinicName,

                doctorName: payload.doctorName

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

module.exports = buildThankYou;