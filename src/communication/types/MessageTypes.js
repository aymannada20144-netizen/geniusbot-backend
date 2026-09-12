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
    GOOGLE_REVIEW: 'google_review',
    SAUDI_NATIONAL_DAY: 'saudi_national_day',
    SAUDI_FOUNDATION_DAY: 'saudi_foundation_day',
    EID_AL_FITR: 'eid_al_fitr',
    EID_AL_ADHA: 'eid_al_adha',
    SPECIAL_OFFER: 'special_offer'
});
