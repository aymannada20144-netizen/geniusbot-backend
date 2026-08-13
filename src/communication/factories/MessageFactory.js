'use strict';

/**
 * ============================================================================
 * GeniusBot Communication Platform
 * MessageFactory
 * ----------------------------------------------------------------------------
 * Central entry point for building communication messages.
 *
 * Responsibilities:
 * - Resolve the registered builder for a message type.
 * - Validate the required payload fields.
 * - Return the standard immutable message object.
 *
 * This factory does NOT:
 * - Send messages.
 * - Access the database.
 * - Call external APIs.
 * - Execute queue jobs.
 * ============================================================================
 */

const MessageTypes = require('../types/MessageTypes');

const validateRequiredFields = require(
    './validators/validateRequiredFields'
);

const buildAppointmentConfirmation = require(
    '../templates/appointmentConfirmation'
);

const buildAppointmentReminder = require(
    '../templates/appointmentReminder'
);

const buildAppointmentCancelled = require(
    '../templates/appointmentCancelled'
);

const buildThankYou = require(
    '../templates/thankYou'
);

const buildGoogleReview = require(
    '../templates/googleReview'
);

const UnknownMessageTypeError = require(
    '../../shared/errors/UnknownMessageTypeError'
);

const APPOINTMENT_CONFIRMATION_REQUIRED_FIELDS = Object.freeze([
    'phone',
    'patientName',
    'doctorName',
    'branchName',
    'roomNumber',
    'appointmentDate',
    'appointmentTime',
    'appointmentId',
    'patientId',
    'clinicId'
]);

const APPOINTMENT_REMINDER_REQUIRED_FIELDS = Object.freeze([
    'phone',
    'patientName',
    'serviceName',
    'doctorName',
    'branchName',
    'roomNumber',
    'appointmentDate',
    'appointmentTime',
    'appointmentNumber',
    'appointmentId',
    'patientId',
    'clinicId'
]);

const APPOINTMENT_CANCELLED_REQUIRED_FIELDS = Object.freeze([
    'phone',
    'patientName',
    'appointmentNumber',
    'serviceName',
    'branchName',
    'appointmentDate',
    'appointmentTime',
    'appointmentId',
    'patientId',
    'clinicId'
]);

const THANK_YOU_REQUIRED_FIELDS = Object.freeze([
    'phone',
    'patientName',
    'appointmentNumber',
    'appointmentId',
    'patientId',
    'clinicId'
]);

const GOOGLE_REVIEW_REQUIRED_FIELDS = Object.freeze([
    'phone',
    'patientName',
    'reviewUrl',
    'appointmentId',
    'patientId',
    'clinicId'
]);

const MESSAGE_REGISTRY = Object.freeze({

    [MessageTypes.APPOINTMENT_CONFIRMATION]: Object.freeze({
        requiredFields: APPOINTMENT_CONFIRMATION_REQUIRED_FIELDS,
        build: buildAppointmentConfirmation
    }),

    [MessageTypes.APPOINTMENT_REMINDER]: Object.freeze({
        requiredFields: APPOINTMENT_REMINDER_REQUIRED_FIELDS,
        build: buildAppointmentReminder
    }),

    [MessageTypes.APPOINTMENT_CANCELLED]: Object.freeze({
        requiredFields: APPOINTMENT_CANCELLED_REQUIRED_FIELDS,
        build: buildAppointmentCancelled
    }),

    [MessageTypes.THANK_YOU]: Object.freeze({
        requiredFields: THANK_YOU_REQUIRED_FIELDS,
        build: buildThankYou
    }),

    [MessageTypes.GOOGLE_REVIEW]: Object.freeze({
        requiredFields: GOOGLE_REVIEW_REQUIRED_FIELDS,
        build: buildGoogleReview
    })

});

class MessageFactory {

    /**
     * Builds a communication message.
     *
     * @param {string} type
     * @param {Object} payload
     * @returns {Readonly<Object>}
     *
     * @throws {UnknownMessageTypeError}
     * @throws {ValidationError}
     */
    static build(type, payload) {

        const registration = MESSAGE_REGISTRY[type];

        if (!registration) {
            throw new UnknownMessageTypeError(
                `Unsupported message type: ${String(type)}`,
                {
                    messageType: type
                }
            );
        }

        validateRequiredFields(
            payload,
            registration.requiredFields,
            type
        );

        return registration.build(payload);
    }

}

module.exports = MessageFactory;
