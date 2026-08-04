'use strict';

const {
  COMMUNICATION_EVENT,
  COMMUNICATION_CHANNEL,
  getTemplateCodeForEvent,
  isCommunicationEvent,
} = require('../../contracts/communication');

class MessageTemplateResolver {
  resolve(
    eventName,
    {
      language = 'ar',
      channel = COMMUNICATION_CHANNEL.WHATSAPP,
    } = {}
  ) {
    this.#validateEventName(eventName);
    this.#validateLanguage(language);
    this.#validateChannel(channel);

    const templateCode =
      getTemplateCodeForEvent(eventName);

    if (!templateCode) {
      throw new Error(
        `No template code is registered for event: ${eventName}.`
      );
    }

    return Object.freeze({
      eventName,
      templateCode,
      language,
      channel,
    });
  }

  supports(eventName) {
    return (
      isCommunicationEvent(eventName) &&
      getTemplateCodeForEvent(eventName) !== null
    );
  }

  #validateEventName(eventName) {
    if (!isCommunicationEvent(eventName)) {
      throw new TypeError(
        'Communication event is invalid or unsupported.'
      );
    }
  }

  #validateLanguage(language) {
    if (
      typeof language !== 'string' ||
      !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)
    ) {
      throw new TypeError(
        'Template language must use a valid language code.'
      );
    }
  }

  #validateChannel(channel) {
    if (
      typeof channel !== 'string' ||
      channel.trim() === ''
    ) {
      throw new TypeError(
        'Communication channel must be a non-empty string.'
      );
    }
  }
}

module.exports = MessageTemplateResolver;