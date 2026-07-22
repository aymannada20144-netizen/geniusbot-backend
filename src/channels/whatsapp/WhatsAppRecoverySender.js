'use strict';

const {
  RECOVERY_CHANNEL,
} = require('../../constants/recoveryChannel');

/**
 * Adapts an approved recovery payload to an outbound WhatsApp function.
 */
class WhatsAppRecoverySender {
  #sendMessage;

  constructor({ sendMessage } = {}) {
    if (typeof sendMessage !== 'function') {
      throw new TypeError(
        'WhatsAppRecoverySender: "sendMessage" must be callable.'
      );
    }

    this.#sendMessage = sendMessage;
  }

  async send(payload) {
    if (!this.#isPlainObject(payload)) {
      throw new TypeError(
        'WhatsAppRecoverySender: "payload" must be a plain object.'
      );
    }

    const channel = this.#requiredString(payload, 'channel');
    const language = this.#requiredString(payload, 'language');
    const recipient = this.#requiredString(payload, 'recipient');
    this.#requiredString(payload, 'body');
    const metadata = this.#requiredPlainObject(payload, 'metadata');
    const templateName = this.#requiredString(
      metadata,
      'whatsappTemplateName',
      'payload.metadata'
    );

    if (channel !== RECOVERY_CHANNEL.WHATSAPP) {
      throw new TypeError(
        'WhatsAppRecoverySender: payload.channel must be WhatsApp.'
      );
    }

    await this.#sendMessage({
      to: recipient,
      templateName,
      language,
    });

    return Object.freeze({
      accepted: true,
    });
  }

  #requiredString(payload, propertyName, objectName = 'payload') {
    const descriptor = Object.getOwnPropertyDescriptor(
      payload,
      propertyName
    );

    if (
      !descriptor ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new TypeError(
        `WhatsAppRecoverySender: ${objectName}.${propertyName} must be an own data property.`
      );
    }

    if (
      typeof descriptor.value !== 'string' ||
      descriptor.value.trim().length === 0
    ) {
      throw new TypeError(
        `WhatsAppRecoverySender: ${objectName}.${propertyName} must be a non-empty string.`
      );
    }

    return descriptor.value;
  }

  #requiredPlainObject(payload, propertyName) {
    const descriptor = Object.getOwnPropertyDescriptor(
      payload,
      propertyName
    );

    if (
      !descriptor ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new TypeError(
        `WhatsAppRecoverySender: payload.${propertyName} must be an own data property.`
      );
    }

    if (!this.#isPlainObject(descriptor.value)) {
      throw new TypeError(
        `WhatsAppRecoverySender: payload.${propertyName} must be a plain object.`
      );
    }

    return descriptor.value;
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

module.exports = WhatsAppRecoverySender;
