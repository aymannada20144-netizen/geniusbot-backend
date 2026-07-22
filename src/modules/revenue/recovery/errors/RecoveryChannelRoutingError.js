'use strict';

const APPROVED_DETAIL_FIELDS = Object.freeze([
  'reason',
  'channel',
]);

/**
 * Thrown when a recovery channel cannot be resolved to a valid provider.
 */
class RecoveryChannelRoutingError extends Error {
  /**
   * @param {string} message
   * @param {object} [details={}]
   */
  constructor(message, details = {}) {
    super(message);

    this.name = 'RecoveryChannelRoutingError';
    this.code = 'RECOVERY_CHANNEL_ROUTING_ERROR';

    const approvedDetails = {};

    if (details && typeof details === 'object') {
      for (const field of APPROVED_DETAIL_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(details, field)) {
          approvedDetails[field] = details[field];
        }
      }
    }

    this.details = Object.freeze(approvedDetails);

    Error.captureStackTrace?.(this, RecoveryChannelRoutingError);
  }
}

module.exports = {
  RecoveryChannelRoutingError,
};
