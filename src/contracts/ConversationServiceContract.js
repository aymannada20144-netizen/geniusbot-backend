const {
  InternalServerError,
  ValidationError,
} = require('../core/errors');

class ConversationContracts {
  static intents = Object.freeze([
    'book_appointment',
    'cancel_appointment',
    'reschedule_appointment',
    'appointment_status',
    'general_inquiry',
    'human_handoff',
    'recover_booking',
    'unknown',
  ]);

  static conversationStatuses = Object.freeze([
    'active',
    'completed',
    'abandoned',
    'handoff',
  ]);

  static messageDirections = Object.freeze([
    'inbound',
    'outbound',
  ]);

  static messageTypes = Object.freeze([
    'text',
    'image',
    'audio',
    'video',
    'document',
    'location',
    'interactive',
    'unsupported',
  ]);

  /**
   * عقد ConversationRepository.findActiveByChannelIdentity()
   *
   * @returns {{
   *   id: string,
   *   channel: string,
   *   senderId: string,
   *   receiverId: string,
   *   contactName: string|null,
   *   state: object,
   *   status: string,
   *   metadata: object
   * } | null}
   */
  static assertConversation(conversation) {
    if (conversation === null) {
      return null;
    }

    if (
      !conversation ||
      typeof conversation !== 'object' ||
      Array.isArray(conversation)
    ) {
      throw new InternalServerError(
        'ConversationRepository returned an invalid conversation.'
      );
    }

    this.requireString(
      conversation.id,
      'conversation.id',
      InternalServerError
    );

    this.requireString(
      conversation.channel,
      'conversation.channel',
      InternalServerError
    );

    this.requireString(
      conversation.senderId,
      'conversation.senderId',
      InternalServerError
    );

    this.requireString(
      conversation.receiverId,
      'conversation.receiverId',
      InternalServerError
    );

    return conversation;
  }

  /**
   * عقد ContextBuilder.build()
   *
   * @returns {{
   *   clinic: object,
   *   branch: object|null,
   *   patient: object|null,
   *   persona: object,
   *   conversation: object,
   *   state: object,
   *   recentMessages: Array<object>,
   *   operationalData: object
   * }}
   */
  static assertContext(context) {
    if (
      !context ||
      typeof context !== 'object' ||
      Array.isArray(context)
    ) {
      throw new InternalServerError(
        'ContextBuilder returned an invalid context.'
      );
    }

    if (
      !context.clinic ||
      typeof context.clinic !== 'object' ||
      Array.isArray(context.clinic)
    ) {
      throw new InternalServerError(
        'Context must contain a valid clinic.'
      );
    }

    if (
      !context.persona ||
      typeof context.persona !== 'object' ||
      Array.isArray(context.persona)
    ) {
      throw new InternalServerError(
        'Context must contain a valid persona.'
      );
    }

    if (!Array.isArray(context.recentMessages)) {
      throw new InternalServerError(
        'Context recentMessages must be an array.'
      );
    }

    return context;
  }

  /**
   * عقد MessageUnderstandingService.understand()
   *
   * @returns {{
   *   intent: string,
   *   confidence: number,
   *   entities: object,
   *   sentiment: string|null,
   *   requiresHuman: boolean,
   *   metadata: object
   * }}
   */
  static normalizeUnderstanding(understanding) {
    if (
      !understanding ||
      typeof understanding !== 'object' ||
      Array.isArray(understanding)
    ) {
      throw new InternalServerError(
        'MessageUnderstandingService returned an invalid result.'
      );
    }

    const intent = this.normalizeIntent(
      understanding.intent
    );

    const confidence = this.normalizeConfidence(
      understanding.confidence
    );

    return {
      intent,
      confidence,

      entities: this.normalizeObject(
        understanding.entities
      ),

      sentiment: this.normalizeNullableString(
        understanding.sentiment
      ),

      requiresHuman: Boolean(
        understanding.requiresHuman
      ),

      metadata: this.normalizeObject(
        understanding.metadata
      ),
    };
  }

  /**
   * العقد الموحد لجميع Conversation Services.
   *
   * BookingConversationService.handle()
   * AppointmentConversationService.handle()
   * InquiryService.handle()
   * RecoveryService.handle()
   *
   * @returns {{
   *   replyText: string,
   *   state: object,
   *   action: string|null,
   *   actionResult: object,
   *   metadata: object
   * }}
   */
  static normalizeServiceResult(
    result,
    {
      stateManager,
      currentState,
    } = {}
  ) {
    if (
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result)
    ) {
      throw new InternalServerError(
        'Conversation service returned an invalid result.'
      );
    }

    if (
      !stateManager ||
      typeof stateManager.normalize !== 'function'
    ) {
      throw new ValidationError(
        'stateManager dependency is required.'
      );
    }

    const replyText = this.requireString(
      result.replyText,
      'result.replyText',
      InternalServerError
    );

    const state = result.state
      ? stateManager.normalize(result.state)
      : stateManager.normalize(currentState);

    return {
      replyText,
      state,

      action: this.normalizeNullableString(
        result.action
      ),

      actionResult: this.normalizeObject(
        result.actionResult
      ),

      metadata: this.normalizeObject(
        result.metadata
      ),
    };
  }

  static normalizeIntent(value) {
    if (typeof value !== 'string') {
      return 'unknown';
    }

    const normalizedValue = value
      .trim()
      .toLowerCase();

    return this.intents.includes(normalizedValue)
      ? normalizedValue
      : 'unknown';
  }

  static normalizeConfidence(value) {
    const normalizedValue = Number(value);

    if (!Number.isFinite(normalizedValue)) {
      return 0;
    }

    if (normalizedValue < 0) {
      return 0;
    }

    if (normalizedValue > 1) {
      return 1;
    }

    return normalizedValue;
  }

  static normalizeNullableString(value) {
    if (typeof value !== 'string') {
      return null;
    }

    return value.trim() || null;
  }

  static normalizeObject(value) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return {};
    }

    return { ...value };
  }

  static requireString(
    value,
    fieldName,
    ErrorClass = ValidationError
  ) {
    if (
      typeof value !== 'string' ||
      !value.trim()
    ) {
      throw new ErrorClass(
        `${fieldName} is required.`
      );
    }

    return value.trim();
  }
}

module.exports = ConversationContracts;