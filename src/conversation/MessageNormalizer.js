const { ValidationError } = require('../core/errors');

/**
 * يحول الرسائل القادمة من أي قناة إلى صيغة موحدة
 * يفهمها ConversationEngine دون معرفة تفاصيل WhatsApp أو غيره.
 */
class MessageNormalizer {
  normalize(message = {}) {
    if (!message || typeof message !== 'object') {
      throw new ValidationError(
        'Message must be a valid object.'
      );
    }

    const channel = this.normalizeRequiredString(
      message.channel,
      'channel'
    );

    const externalMessageId =
      this.normalizeRequiredString(
        message.externalMessageId,
        'externalMessageId'
      );

    const senderId = this.normalizeRequiredString(
      message.senderId,
      'senderId'
    );

    const receiverId =
      this.normalizeRequiredString(
        message.receiverId,
        'receiverId'
      );

    const messageType = this.normalizeMessageType(
      message.messageType
    );

    const text = this.normalizeText(
      message.text,
      messageType
    );

    const receivedAt = this.normalizeReceivedAt(
      message.receivedAt
    );

    return {
      channel,
      externalMessageId,
      senderId,
      receiverId,
      messageType,
      text,
      receivedAt,

      contactName:
        this.normalizeOptionalString(
          message.contactName
        ),

      replyToMessageId:
        this.normalizeOptionalString(
          message.replyToMessageId
        ),

      media: this.normalizeMedia(
        message.media,
        messageType
      ),

      metadata: this.normalizeObject(
        message.metadata
      ),

      rawPayload: this.normalizeObject(
        message.rawPayload
      ),
    };
  }

  normalizeRequiredString(value, fieldName) {
    if (
      typeof value !== 'string' ||
      !value.trim()
    ) {
      throw new ValidationError(
        `${fieldName} is required.`
      );
    }

    return value.trim();
  }

  normalizeOptionalString(value) {
    if (
      value === undefined ||
      value === null
    ) {
      return null;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const normalizedValue = value.trim();

    return normalizedValue || null;
  }

  normalizeMessageType(value) {
    const normalizedType =
      this.normalizeRequiredString(
        value,
        'messageType'
      ).toLowerCase();

    const supportedTypes = new Set([
      'text',
      'image',
      'audio',
      'video',
      'document',
      'location',
      'interactive',
      'unsupported',
    ]);

    if (!supportedTypes.has(normalizedType)) {
      return 'unsupported';
    }

    return normalizedType;
  }

  normalizeText(value, messageType) {
    if (
      value === undefined ||
      value === null
    ) {
      if (messageType === 'text') {
        throw new ValidationError(
          'text is required for text messages.'
        );
      }

      return null;
    }

    if (typeof value !== 'string') {
      throw new ValidationError(
        'text must be a string.'
      );
    }

    const normalizedText = value
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (
      messageType === 'text' &&
      !normalizedText
    ) {
      throw new ValidationError(
        'text cannot be empty.'
      );
    }

    return normalizedText || null;
  }

  normalizeReceivedAt(value) {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return new Date();
    }

    const receivedAt =
      value instanceof Date
        ? new Date(value.getTime())
        : new Date(value);

    if (Number.isNaN(receivedAt.getTime())) {
      throw new ValidationError(
        'receivedAt must be a valid date.'
      );
    }

    return receivedAt;
  }

  normalizeMedia(media, messageType) {
    const mediaTypes = new Set([
      'image',
      'audio',
      'video',
      'document',
    ]);

    if (!mediaTypes.has(messageType)) {
      return null;
    }

    if (
      !media ||
      typeof media !== 'object' ||
      Array.isArray(media)
    ) {
      return null;
    }

    return {
      externalMediaId:
        this.normalizeOptionalString(
          media.externalMediaId
        ),

      mimeType:
        this.normalizeOptionalString(
          media.mimeType
        ),

      filename:
        this.normalizeOptionalString(
          media.filename
        ),

      caption:
        this.normalizeOptionalString(
          media.caption
        ),

      sizeBytes:
        this.normalizePositiveNumber(
          media.sizeBytes
        ),
    };
  }

  normalizePositiveNumber(value) {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return null;
    }

    const normalizedValue = Number(value);

    if (
      !Number.isFinite(normalizedValue) ||
      normalizedValue < 0
    ) {
      return null;
    }

    return normalizedValue;
  }

  normalizeObject(value) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return {};
    }

    return value;
  }
}

module.exports = MessageNormalizer;