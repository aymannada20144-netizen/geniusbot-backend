'use strict';

/**
 * ============================================================================
 * GeniusBot Communication Platform
 * Google Review Template
 * ----------------------------------------------------------------------------
 * Builds the standard message object for requesting a Google review after
 * the patient's completed visit.
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
 * Builds a Google review request message.
 *
 * @param {Object} payload
 * @returns {Readonly<Object>}
 */
function buildGoogleReview(payload) {
    return Object.freeze({
        type: MessageTypes.GOOGLE_REVIEW,

        channel: 'whatsapp',

        recipient: Object.freeze({
            phone: payload.phone
        }),

        template: Object.freeze({
            name: MessageTypes.GOOGLE_REVIEW,

            language: payload.language || 'ar',

            variables: Object.freeze({
                patientName: payload.patientName,
                clinicName: payload.clinicName,
                reviewUrl: payload.reviewUrl
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

module.exports = buildGoogleReview;