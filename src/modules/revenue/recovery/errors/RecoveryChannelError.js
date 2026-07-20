'use strict';

/**
 * ============================================================================
 * Recovery Channel Error
 * ============================================================================
 *
 * Thrown when a recovery channel cannot be used because of channel-specific
 * validation or configuration problems.
 *
 * Examples:
 * - Unsupported recovery channel.
 * - Channel is disabled for the clinic.
 * - Missing patient phone number.
 * - Missing email address.
 * - Missing channel configuration.
 * - Missing sender credentials.
 *
 * This error is different from RecoveryExecutionError.
 *
 * RecoveryChannelError:
 *     The channel cannot be used.
 *
 * RecoveryExecutionError:
 *     The channel is valid, but execution failed.
 * ============================================================================
 */
class RecoveryChannelError extends Error {
  /**
   * @param {string} message
   * @param {object} [details={}]
   * @param {string} [details.reason]
   * @param {string} [details.channel]
   * @param {string} [details.clinicId]
   * @param {string} [details.patientId]
   * @param {string} [details.provider]
   * @param {string} [details.configurationKey]
   * @param {Error} [options.cause]
   */
  constructor(message, details = {}, options = {}) {
    super(message, options);

    this.name = 'RecoveryChannelError';
    this.code = 'RECOVERY_CHANNEL_ERROR';

    this.details = Object.freeze({
      ...details,
    });

    Error.captureStackTrace?.(this, RecoveryChannelError);
  }

  /**
   * Returns the recovery channel involved in the error.
   *
   * @returns {string|undefined}
   */
  getChannel() {
    return this.details.channel;
  }

  /**
   * Indicates whether the error is caused by
   * missing or invalid configuration.
   *
   * @returns {boolean}
   */
  isConfigurationError() {
    return this.details.reason === 'configuration';
  }

  /**
   * Indicates whether the error is caused by
   * missing recipient information.
   *
   * @returns {boolean}
   */
  isRecipientError() {
    return this.details.reason === 'recipient';
  }

  /**
   * Indicates whether the selected recovery
   * channel is unsupported.
   *
   * @returns {boolean}
   */
  isUnsupportedChannel() {
    return this.details.reason === 'unsupported_channel';
  }
}

module.exports = {
  RecoveryChannelError,
};