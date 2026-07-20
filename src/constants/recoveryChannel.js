'use strict';

/**
 * ============================================================================
 * Recovery Channel Constants
 * ============================================================================
 *
 * These values MUST remain synchronized with:
 * geniusbot.recovery_attempts.channel
 *
 * Database values:
 * - phone
 * - whatsapp
 * - sms
 * - email
 * - dashboard
 * ============================================================================
 */

/**
 * Supported recovery communication channels.
 */
const RECOVERY_CHANNEL = Object.freeze({
  PHONE: 'phone',
  WHATSAPP: 'whatsapp',
  SMS: 'sms',
  EMAIL: 'email',
  DASHBOARD: 'dashboard',
});

/**
 * All supported recovery channel values.
 */
const RECOVERY_CHANNEL_VALUES = Object.freeze(
  Object.values(RECOVERY_CHANNEL),
);

/**
 * Channels that send a message through an external provider.
 */
const EXTERNAL_RECOVERY_CHANNELS = Object.freeze([
  RECOVERY_CHANNEL.PHONE,
  RECOVERY_CHANNEL.WHATSAPP,
  RECOVERY_CHANNEL.SMS,
  RECOVERY_CHANNEL.EMAIL,
]);

/**
 * Channels handled internally without an external messaging provider.
 */
const INTERNAL_RECOVERY_CHANNELS = Object.freeze([
  RECOVERY_CHANNEL.DASHBOARD,
]);

/**
 * Channels that use text-based recovery messages.
 */
const TEXT_RECOVERY_CHANNELS = Object.freeze([
  RECOVERY_CHANNEL.WHATSAPP,
  RECOVERY_CHANNEL.SMS,
  RECOVERY_CHANNEL.EMAIL,
]);

/**
 * Channels that require a patient phone number.
 */
const PHONE_NUMBER_RECOVERY_CHANNELS = Object.freeze([
  RECOVERY_CHANNEL.PHONE,
  RECOVERY_CHANNEL.WHATSAPP,
  RECOVERY_CHANNEL.SMS,
]);

/**
 * Determines whether a value is a supported recovery channel.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isRecoveryChannel(value) {
  return (
    typeof value === 'string' &&
    RECOVERY_CHANNEL_VALUES.includes(value)
  );
}

/**
 * Determines whether a channel uses an external provider.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isExternalRecoveryChannel(value) {
  return (
    typeof value === 'string' &&
    EXTERNAL_RECOVERY_CHANNELS.includes(value)
  );
}

/**
 * Determines whether a channel is handled internally.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isInternalRecoveryChannel(value) {
  return (
    typeof value === 'string' &&
    INTERNAL_RECOVERY_CHANNELS.includes(value)
  );
}

/**
 * Determines whether a channel uses text content.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isTextRecoveryChannel(value) {
  return (
    typeof value === 'string' &&
    TEXT_RECOVERY_CHANNELS.includes(value)
  );
}

/**
 * Determines whether a channel requires a patient phone number.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function requiresRecoveryPhoneNumber(value) {
  return (
    typeof value === 'string' &&
    PHONE_NUMBER_RECOVERY_CHANNELS.includes(value)
  );
}

module.exports = {
  RECOVERY_CHANNEL,
  RECOVERY_CHANNEL_VALUES,

  EXTERNAL_RECOVERY_CHANNELS,
  INTERNAL_RECOVERY_CHANNELS,
  TEXT_RECOVERY_CHANNELS,
  PHONE_NUMBER_RECOVERY_CHANNELS,

  isRecoveryChannel,
  isExternalRecoveryChannel,
  isInternalRecoveryChannel,
  isTextRecoveryChannel,
  requiresRecoveryPhoneNumber,
};