'use strict';

/**
 * ============================================================================
 * GeniusBot Communication Platform
 * Required Fields Validator
 * ----------------------------------------------------------------------------
 * Validates that a payload contains all fields required by a message type.
 * ============================================================================
 */

const ValidationError = require('../../../shared/errors/ValidationError');

/**
 * Validates required payload fields.
 *
 * @param {Object} payload
 * @param {ReadonlyArray<string>} requiredFields
 * @param {string} messageType
 * @returns {true}
 *
 * @throws {ValidationError}
 */
function validateRequiredFields(payload, requiredFields, messageType) {

    if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload)
    ) {
        throw new ValidationError(
            `Payload for message type "${messageType}" must be an object.`
        );
    }

    for (const field of requiredFields) {

        const value = payload[field];

        const isMissing =
            value === undefined ||
            value === null ||
            (
                typeof value === 'string' &&
                value.trim() === ''
            );

        if (isMissing) {
            throw new ValidationError(
                `Missing required field "${field}" for message type "${messageType}".`,
                {
                    messageType,
                    field
                }
            );
        }

    }

    return true;
}

module.exports = validateRequiredFields;