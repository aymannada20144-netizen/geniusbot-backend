'use strict';

/**
 * Supported communication message types.
 */
module.exports = Object.freeze({
    APPOINTMENT_CONFIRMATION: 'appointment_confirmation',
    APPOINTMENT_RESCHEDULED: 'appointment_rescheduled',
    APPOINTMENT_REMINDER: 'appointment_reminder',
    APPOINTMENT_CANCELLED: 'appointment_cancelled',
    THANK_YOU: 'thank_you',
    GOOGLE_REVIEW: 'google_review'
});
