'use strict';

const {
  isRecoveryChannel,
} = require('../../../constants/recoveryChannel');

const {
  RecoveryChannelRoutingError,
} = require('./errors/RecoveryChannelRoutingError');

/**
 * Pure registry-based router for already-selected recovery channels.
 */
class RecoveryChannelRouter {
  /**
   * Resolves the provider registered for a recovery payload's channel.
   *
   * @param {object} context
   * @returns {Readonly<{provider: object|Function, payload: object}>}
   */
  route(context = {}) {
    this.#assertPlainObject(context, 'context');
    this.#assertPlainObject(context.payload, 'context.payload');
    this.#assertPlainObject(context.providers, 'context.providers');

    const payload = context.payload;
    const providers = context.providers;
    const channel = this.#resolveChannel(payload);

    if (!isRecoveryChannel(channel)) {
      this.#throwRoutingError(
        `Unknown recovery channel "${channel}".`,
        'UNKNOWN_CHANNEL',
        channel
      );
    }

    const provider = this.#resolveProvider(providers, channel);

    this.#assertCallableSend(provider, channel);

    return Object.freeze({
      provider,
      payload,
    });
  }

  #resolveChannel(payload) {
    const descriptor = Object.getOwnPropertyDescriptor(
      payload,
      'channel'
    );

    if (!descriptor) {
      throw new TypeError(
        'RecoveryChannelRouter: payload.channel must be an own property.'
      );
    }

    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(
        'RecoveryChannelRouter: payload.channel must be a data property.'
      );
    }

    const channel = descriptor.value;

    if (typeof channel !== 'string') {
      throw new TypeError(
        'RecoveryChannelRouter: payload.channel must be a string.'
      );
    }

    if (channel.trim().length === 0) {
      throw new TypeError(
        'RecoveryChannelRouter: payload.channel must not be empty.'
      );
    }

    return channel;
  }

  #resolveProvider(providers, channel) {
    const descriptor = Object.getOwnPropertyDescriptor(
      providers,
      channel
    );

    if (!descriptor) {
      this.#throwRoutingError(
        `No recovery provider is registered for channel "${channel}".`,
        'PROVIDER_NOT_REGISTERED',
        channel
      );
    }

    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      this.#throwRoutingError(
        `Recovery provider registration for channel "${channel}" is invalid.`,
        'INVALID_PROVIDER',
        channel
      );
    }

    const provider = descriptor.value;
    const providerType = typeof provider;

    if (
      provider === null ||
      (providerType !== 'object' && providerType !== 'function')
    ) {
      this.#throwRoutingError(
        `Recovery provider registration for channel "${channel}" is invalid.`,
        'INVALID_PROVIDER',
        channel
      );
    }

    return provider;
  }

  #assertCallableSend(provider, channel) {
    let current = provider;

    while (current !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(
        current,
        'send'
      );

      if (descriptor) {
        if (
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          typeof descriptor.value !== 'function'
        ) {
          this.#throwRoutingError(
            `Recovery provider for channel "${channel}" has an invalid send method.`,
            'INVALID_PROVIDER',
            channel
          );
        }

        return;
      }

      current = Object.getPrototypeOf(current);
    }

    this.#throwRoutingError(
      `Recovery provider for channel "${channel}" has no send method.`,
      'INVALID_PROVIDER',
      channel
    );
  }

  #throwRoutingError(message, reason, channel) {
    throw new RecoveryChannelRoutingError(message, {
      reason,
      channel,
    });
  }

  #assertPlainObject(value, fieldName) {
    if (!this.#isPlainObject(value)) {
      throw new TypeError(
        `RecoveryChannelRouter: "${fieldName}" must be a plain object.`
      );
    }
  }

  #isPlainObject(value) {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
  }
}

module.exports = RecoveryChannelRouter;
