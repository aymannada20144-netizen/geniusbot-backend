'use strict';

/**
 * ============================================================================
 * GeniusBot
 * Unknown Message Type Error
 * ----------------------------------------------------------------------------
 * Thrown when MessageFactory receives an unsupported message type.
 * ============================================================================
 */

class UnknownMessageTypeError extends Error {
    /**
     * @param {string} message
     * @param {Object} [details]
     */
    constructor(message, details = null) {
        super(message);

        this.name = 'UnknownMessageTypeError';
        this.code = 'UNKNOWN_MESSAGE_TYPE';
        this.details = details;

        Error.captureStackTrace?.(this, UnknownMessageTypeError);
    }
}

module.exports = UnknownMessageTypeError;