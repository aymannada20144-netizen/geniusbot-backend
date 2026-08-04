'use strict';

/**
 * ============================================================================
 * GeniusBot Communication Platform
 * CommunicationService
 * ----------------------------------------------------------------------------
 * Coordinates communication message creation and delivery.
 *
 * Responsibilities:
 * - Build a standard message through MessageFactory.
 * - Execute message delivery through CommunicationJob.
 * - Return the job execution result unchanged.
 *
 * This service does NOT:
 * - Access the database.
 * - Decide when messages should be sent.
 * - Schedule reminders.
 * - Call Meta directly.
 * - Retry messages directly.
 * - Persist delivery records.
 * ============================================================================
 */

const MessageFactory = require(
    '../factories/MessageFactory'
);

class CommunicationService {

    /**
     * @param {Object} options
     * @param {Object} options.job
     * @param {Function} options.job.execute
     */
    constructor({
        job
    }) {
        if (
            !job ||
            typeof job.execute !== 'function'
        ) {
            throw new TypeError(
                'CommunicationService requires a job with an execute(message) function.'
            );
        }

        this.job = job;
    }

    /**
     * Builds and sends a communication message.
     *
     * @param {string} type
     * @param {Object} payload
     * @returns {Promise<Readonly<Object>>}
     */
    async send(type, payload) {
        const message = MessageFactory.build(
            type,
            payload
        );

        return this.job.execute(message);
    }
}

module.exports = CommunicationService;