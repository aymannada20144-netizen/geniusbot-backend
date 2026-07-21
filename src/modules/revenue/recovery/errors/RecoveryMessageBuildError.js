'use strict';

const APPROVED_DETAIL_FIELDS = Object.freeze([
  'reason',
  'templateId',
  'placeholder',
  'channel',
  'language',
]);

/**
 * Thrown when a validly shaped recovery message cannot be rendered.
 */
class RecoveryMessageBuildError extends Error {
  /**
   * @param {string} message
   * @param {object} [details={}]
   */
  constructor(message, details = {}) {
    super(message);

    this.name = 'RecoveryMessageBuildError';

    const approvedDetails = {};

    if (details && typeof details === 'object') {
      for (const field of APPROVED_DETAIL_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(details, field)) {
          approvedDetails[field] = details[field];
        }
      }
    }

    this.details = Object.freeze(approvedDetails);

    Error.captureStackTrace?.(this, RecoveryMessageBuildError);
  }
}

module.exports = {
  RecoveryMessageBuildError,
};
