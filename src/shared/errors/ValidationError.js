'use strict';

/**
 * ============================================================================
 * GeniusBot
 * Validation Error
 * ----------------------------------------------------------------------------
 * Represents invalid or incomplete input supplied to an application component.
 * ============================================================================
 */

class ValidationError extends Error {
    /**
     * @param {string} message
     * @param {Object} [details]
     */
    constructor(message, details = null) {
        super(message);

        this.name = 'ValidationError';
        this.code = 'VALIDATION_ERROR';
        this.details = details;

        Error.captureStackTrace?.(this, ValidationError);
    }
}

module.exports = ValidationError;