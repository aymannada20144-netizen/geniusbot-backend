'use strict';

/**
 * ============================================================================
 * GeniusBot Communication Platform
 * CommunicationJob
 * ----------------------------------------------------------------------------
 * Executes the delivery lifecycle of a standard communication message.
 *
 * Responsibilities:
 * - Validate the supplied message structure.
 * - Send the message through the injected transport.
 * - Retry retryable failures.
 * - Return a standard execution result.
 *
 * This job does NOT:
 * - Build messages.
 * - Access the database.
 * - Call WhatsApp directly.
 * - Manage a queue.
 * - Persist delivery records.
 * ============================================================================
 */

class CommunicationJob {

    /**
     * @param {Object} options
     * @param {Object} options.transport
     * @param {Function} options.transport.send
     * @param {number} [options.maxAttempts=3]
     * @param {number} [options.retryDelayMs=0]
     */
    constructor({
        transport,
        maxAttempts = 3,
        retryDelayMs = 0
    }) {
        if (
            !transport ||
            typeof transport.send !== 'function'
        ) {
            throw new TypeError(
                'CommunicationJob requires a transport with a send(message) function.'
            );
        }

        if (
            !Number.isInteger(maxAttempts) ||
            maxAttempts < 1
        ) {
            throw new TypeError(
                'CommunicationJob maxAttempts must be a positive integer.'
            );
        }

        if (
            typeof retryDelayMs !== 'number' ||
            retryDelayMs < 0
        ) {
            throw new TypeError(
                'CommunicationJob retryDelayMs must be a non-negative number.'
            );
        }

        this.transport = transport;
        this.maxAttempts = maxAttempts;
        this.retryDelayMs = retryDelayMs;
    }

    /**
     * Executes message delivery.
     *
     * @param {Object} message
     * @returns {Promise<Readonly<Object>>}
     */
    async execute(message) {
        this.#validateMessage(message);

        let lastError = null;

        for (
            let attempt = 1;
            attempt <= this.maxAttempts;
            attempt += 1
        ) {
            try {
                const transportResult = await this.transport.send(message);

                return Object.freeze({
                    success: true,
                    status: 'sent',
                    attempts: attempt,
                    messageType: message.type,
                    channel: message.channel,
                    recipient: message.recipient.phone,
                    transportResult: transportResult || null,
                    error: null
                });

            } catch (error) {
                lastError = error;

                const retryable = this.#isRetryable(error);
                const hasAttemptsRemaining = attempt < this.maxAttempts;

                if (!retryable || !hasAttemptsRemaining) {
                    break;
                }

                await this.#wait(this.retryDelayMs);
            }
        }

        return Object.freeze({
            success: false,
            status: 'failed',
            attempts: this.#resolveFailureAttempts(lastError),
            messageType: message.type,
            channel: message.channel,
            recipient: message.recipient.phone,
            transportResult: null,
            error: Object.freeze({
                name: lastError?.name || 'Error',
                code: lastError?.code || 'COMMUNICATION_SEND_FAILED',
                message: lastError?.message || 'Communication delivery failed.',
                retryable: this.#isRetryable(lastError),
                statusCode: lastError?.statusCode || null,
                errorSubcode: lastError?.metaErrorSubcode || null,
                details:
                    lastError?.response?.error?.error_data?.details || null,
                fbtraceId: lastError?.metaTraceId || null
            })
        });
    }

    /**
     * Validates the minimum standard-message structure.
     *
     * @param {Object} message
     * @private
     */
    #validateMessage(message) {
        if (
            !message ||
            typeof message !== 'object' ||
            Array.isArray(message)
        ) {
            throw new TypeError(
                'CommunicationJob message must be an object.'
            );
        }

        if (
            typeof message.type !== 'string' ||
            message.type.trim() === ''
        ) {
            throw new TypeError(
                'CommunicationJob message.type is required.'
            );
        }

        if (
            typeof message.channel !== 'string' ||
            message.channel.trim() === ''
        ) {
            throw new TypeError(
                'CommunicationJob message.channel is required.'
            );
        }

        if (
            !message.recipient ||
            typeof message.recipient.phone !== 'string' ||
            message.recipient.phone.trim() === ''
        ) {
            throw new TypeError(
                'CommunicationJob message.recipient.phone is required.'
            );
        }

        if (
            !message.template ||
            typeof message.template !== 'object'
        ) {
            throw new TypeError(
                'CommunicationJob message.template is required.'
            );
        }
    }

    /**
     * Determines whether an error may be retried.
     *
     * Transport errors may explicitly set:
     * error.retryable = false
     *
     * All other errors are considered retryable by default.
     *
     * @param {Error|null} error
     * @returns {boolean}
     * @private
     */
    #isRetryable(error) {
        return error?.retryable !== false;
    }

    /**
     * Waits before the next attempt.
     *
     * @param {number} delayMs
     * @returns {Promise<void>}
     * @private
     */
    #wait(delayMs) {
        if (delayMs === 0) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            setTimeout(resolve, delayMs);
        });
    }

    /**
     * Returns the configured attempt count for a failed execution.
     *
     * Non-retryable failures stop at the first attempt.
     *
     * @param {Error|null} error
     * @returns {number}
     * @private
     */
    #resolveFailureAttempts(error) {
        return this.#isRetryable(error)
            ? this.maxAttempts
            : 1;
    }
}

module.exports = CommunicationJob;
