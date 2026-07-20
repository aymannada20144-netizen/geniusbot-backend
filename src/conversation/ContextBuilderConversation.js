'use strict';

/**
 * ContextBuilderConversation
 *
 * يبني الجزء الخاص بالمحادثة داخل الـ Context العام.
 *
 * المسؤوليات:
 * - البحث عن محادثة قائمة بواسطة هوية القناة.
 * - إنشاء محادثة جديدة عند عدم وجودها.
 * - تحميل حالة المحادثة.
 * - تحميل آخر الرسائل.
 *
 * لا يحتوي على:
 * - SQL مباشر.
 * - منطق حجز.
 * - استدعاءات AI.
 */
class ContextBuilderConversation {
  constructor({
    conversationRepository,
    messageRepository,
    recentMessagesLimit = 20,
  } = {}) {
    this.#assertRepository(
      conversationRepository,
      'conversationRepository',
      ['findByChannelIdentity', 'create', 'loadState']
    );

    this.#assertRepository(
      messageRepository,
      'messageRepository',
      ['getRecentMessages']
    );

    this.#assertRecentMessagesLimit(recentMessagesLimit);

    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.recentMessagesLimit = recentMessagesLimit;
  }

  /**
   * @param {Object} input
   * @param {string} input.clinicId
   * @param {string} input.channel
   * @param {string} input.channelIdentity
   * @param {Object} input.message
   *
   * @returns {Promise<{
   *   conversation: {
   *     id: string,
   *     clinicId: string,
   *     patientId: string|null,
   *     channel: string,
   *     status: string,
   *     assignedToStaffId: string|null,
   *     botEnabled: boolean,
   *     handoverAt: Date|string|null,
   *     handoverReason: string|null,
   *     startedAt: Date|string|null,
   *     endedAt: Date|string|null
   *   },
   *   state: {
   *     current: string|null,
   *     data: Object
   *   },
   *   recentMessages: Array,
   *   patientId: string|null,
   *   isExistingConversation: boolean
   * }>}
   */
  async build(input = {}) {
    const normalizedInput = this.#validateAndNormalizeInput(input);

    let conversation =
      await this.conversationRepository.findByChannelIdentity({
        clinicId: normalizedInput.clinicId,
        channel: normalizedInput.channel,
        channelIdentity: normalizedInput.channelIdentity,
      });

    const isExistingConversation = Boolean(conversation);

    if (!conversation) {
      conversation = await this.conversationRepository.create({
        clinicId: normalizedInput.clinicId,
        channel: normalizedInput.channel,
        channelIdentity: normalizedInput.channelIdentity,
      });
    }

    this.#assertConversation(conversation);

    const [storedState, recentMessages] = await Promise.all([
      this.conversationRepository.loadState(conversation.id),

      this.messageRepository.getRecentMessages({
        conversationId: conversation.id,
        limit: this.recentMessagesLimit,
      }),
    ]);

    return {
      conversation,

      state: this.#normalizeState(storedState),

      recentMessages: Array.isArray(recentMessages)
        ? recentMessages
        : [],

      patientId: conversation.patientId ?? null,

      isExistingConversation,
    };
  }

  /**
   * يتحقق من مدخلات البناء ويوحدها.
   *
   * @private
   */
  #validateAndNormalizeInput(input) {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input)
    ) {
      throw new TypeError(
        'ContextBuilderConversation input must be an object.'
      );
    }

    const clinicId = this.#requireString(
      input.clinicId,
      'clinicId'
    );

    const channel = this.#requireString(
      input.channel,
      'channel'
    ).toLowerCase();

    const channelIdentity = this.#requireString(
      input.channelIdentity,
      'channelIdentity'
    );

    if (
      !input.message ||
      typeof input.message !== 'object' ||
      Array.isArray(input.message)
    ) {
      throw new TypeError(
        'ContextBuilderConversation requires message to be an object.'
      );
    }

    return {
      clinicId,
      channel,
      channelIdentity,
      message: { ...input.message },
    };
  }

  /**
   * يتحقق من سجل المحادثة المعاد من المستودع.
   *
   * ConversationRepository مسؤول عن إعادة البيانات
   * بصيغة camelCase المطابقة للعقد المعتمد.
   *
   * @private
   */
  #assertConversation(conversation) {
    if (
      !conversation ||
      typeof conversation !== 'object' ||
      Array.isArray(conversation)
    ) {
      throw new Error(
        'ConversationRepository did not return a valid conversation.'
      );
    }

    this.#assertNonEmptyString(
      conversation.id,
      'ConversationRepository returned a conversation without a valid id.'
    );

    this.#assertNonEmptyString(
      conversation.clinicId,
      'ConversationRepository returned a conversation without a valid clinicId.'
    );

    this.#assertNonEmptyString(
      conversation.channel,
      'ConversationRepository returned a conversation without a valid channel.'
    );

    this.#assertNonEmptyString(
      conversation.status,
      'ConversationRepository returned a conversation without a valid status.'
    );

    const allowedStatuses = new Set([
      'open',
      'closed',
      'archived',
    ]);

    if (!allowedStatuses.has(conversation.status)) {
      throw new Error(
        `ConversationRepository returned unsupported status: ${conversation.status}.`
      );
    }

    if (
      conversation.patientId !== null &&
      conversation.patientId !== undefined &&
      (
        typeof conversation.patientId !== 'string' ||
        !conversation.patientId.trim()
      )
    ) {
      throw new Error(
        'ConversationRepository returned an invalid patientId.'
      );
    }

    if (typeof conversation.botEnabled !== 'boolean') {
      throw new Error(
        'ConversationRepository returned an invalid botEnabled value.'
      );
    }
  }

  /**
   * يوحد حالة المحادثة في العقد الداخلي المعتمد.
   *
   * @private
   */
  #normalizeState(state) {
    if (
      !state ||
      typeof state !== 'object' ||
      Array.isArray(state)
    ) {
      return {
        current: null,
        data: {},
      };
    }

    const current =
      typeof state.current === 'string' &&
      state.current.trim()
        ? state.current.trim()
        : null;

    const data =
      state.data &&
      typeof state.data === 'object' &&
      !Array.isArray(state.data)
        ? { ...state.data }
        : {};

    return {
      current,
      data,
    };
  }

  /**
   * يتحقق من المستودع والدوال المطلوبة.
   *
   * @private
   */
  #assertRepository(
    repository,
    repositoryName,
    requiredMethods
  ) {
    if (
      !repository ||
      typeof repository !== 'object' ||
      Array.isArray(repository)
    ) {
      throw new TypeError(
        `ContextBuilderConversation requires ${repositoryName}.`
      );
    }

    for (const methodName of requiredMethods) {
      if (typeof repository[methodName] !== 'function') {
        throw new TypeError(
          `ContextBuilderConversation requires ${repositoryName}.${methodName}().`
        );
      }
    }
  }

  /**
   * يتحقق من عدد الرسائل الأخيرة المطلوب تحميلها.
   *
   * @private
   */
  #assertRecentMessagesLimit(limit) {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new TypeError(
        'recentMessagesLimit must be an integer between 1 and 100.'
      );
    }
  }

  /**
   * يتحقق من النصوص المطلوبة.
   *
   * @private
   */
  #requireString(value, fieldName) {
    if (
      typeof value !== 'string' ||
      !value.trim()
    ) {
      throw new TypeError(
        `ContextBuilderConversation requires a valid ${fieldName}.`
      );
    }

    return value.trim();
  }

  /**
   * يتحقق من وجود نص غير فارغ.
   *
   * @private
   */
  #assertNonEmptyString(value, errorMessage) {
    if (
      typeof value !== 'string' ||
      !value.trim()
    ) {
      throw new Error(errorMessage);
    }
  }
}

module.exports = ContextBuilderConversation;