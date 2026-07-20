const { ValidationError } = require('../core/errors');

/**
 * العقد الرسمي لـ ConversationRepository.
 *
 * هذا الملف:
 * - لا يتصل بقاعدة البيانات.
 * - لا ينفذ SQL.
 * - لا يحفظ أي بيانات.
 *
 * مهمته فقط التأكد من أن أي Implementation مستقبلي
 * يوفّر العمليات التي يعتمد عليها ConversationEngine.
 */
class ConversationRepositoryContract {
  static requiredMethods = Object.freeze([
    'findActiveByChannelIdentity',
    'create',
    'updateState',
    'findById',
    'close',
  ]);

  /**
   * يتحقق من أن Repository الفعلي يلتزم بالعقد.
   *
   * @param {object} repository
   * @returns {object}
   */
  static assertImplementation(repository) {
    if (
      !repository ||
      typeof repository !== 'object' ||
      Array.isArray(repository)
    ) {
      throw new ValidationError(
        'ConversationRepository implementation is required.'
      );
    }

    for (const methodName of this.requiredMethods) {
      if (typeof repository[methodName] !== 'function') {
        throw new ValidationError(
          `ConversationRepository.${methodName} must be a function.`
        );
      }
    }

    return repository;
  }

  /**
   * عقد:
   * findActiveByChannelIdentity(input)
   *
   * الهدف:
   * البحث عن المحادثة النشطة الحالية للعميل داخل قناة محددة.
   *
   * المدخل:
   * {
   *   channel: string,
   *   senderId: string,
   *   receiverId: string
   * }
   *
   * المخرج:
   * Conversation | null
   *
   * Conversation:
   * {
   *   id: string,
   *   clinicId: string,
   *   branchId: string|null,
   *   channel: string,
   *   senderId: string,
   *   receiverId: string,
   *   contactName: string|null,
   *   patientId: string|null,
   *   state: object,
   *   lastIntent: string|null,
   *   status: string,
   *   metadata: object,
   *   startedAt: Date,
   *   lastMessageAt: Date,
   *   closedAt: Date|null,
   *   createdAt: Date,
   *   updatedAt: Date
   * }
   */
  static assertFindActiveInput(input) {
    this.assertObject(
      input,
      'findActiveByChannelIdentity input'
    );

    return {
      channel: this.requireString(
        input.channel,
        'channel'
      ),

      senderId: this.requireString(
        input.senderId,
        'senderId'
      ),

      receiverId: this.requireString(
        input.receiverId,
        'receiverId'
      ),
    };
  }

  /**
   * عقد:
   * create(input)
   *
   * الهدف:
   * إنشاء محادثة نشطة جديدة.
   *
   * المدخل:
   * {
   *   clinicId?: string,
   *   branchId?: string|null,
   *   channel: string,
   *   senderId: string,
   *   receiverId: string,
   *   contactName?: string|null,
   *   patientId?: string|null,
   *   state: object,
   *   metadata?: object
   * }
   *
   * المخرج:
   * Conversation
   */
  static assertCreateInput(input) {
    this.assertObject(input, 'create input');

    return {
      clinicId: this.normalizeNullableString(
        input.clinicId
      ),

      branchId: this.normalizeNullableString(
        input.branchId
      ),

      channel: this.requireString(
        input.channel,
        'channel'
      ),

      senderId: this.requireString(
        input.senderId,
        'senderId'
      ),

      receiverId: this.requireString(
        input.receiverId,
        'receiverId'
      ),

      contactName: this.normalizeNullableString(
        input.contactName
      ),

      patientId: this.normalizeNullableString(
        input.patientId
      ),

      state: this.normalizeObject(input.state),

      metadata: this.normalizeObject(
        input.metadata
      ),
    };
  }

  /**
   * عقد:
   * updateState(input)
   *
   * الهدف:
   * تحديث حالة المحادثة بعد معالجة رسالة.
   *
   * المدخل:
   * {
   *   conversationId: string,
   *   state: object,
   *   lastIntent?: string|null,
   *   status?: string,
   *   patientId?: string|null
   * }
   *
   * المخرج:
   * Conversation
   */
  static assertUpdateStateInput(input) {
    this.assertObject(
      input,
      'updateState input'
    );

    return {
      conversationId: this.requireString(
        input.conversationId,
        'conversationId'
      ),

      state: this.normalizeObject(input.state),

      lastIntent: this.normalizeNullableString(
        input.lastIntent
      ),

      status: this.normalizeStatus(
        input.status
      ),

      patientId: this.normalizeNullableString(
        input.patientId
      ),
    };
  }

  /**
   * عقد:
   * findById(conversationId)
   *
   * الهدف:
   * جلب محادثة واحدة بالمعرّف.
   *
   * المخرج:
   * Conversation | null
   */
  static assertFindByIdInput(conversationId) {
    return this.requireString(
      conversationId,
      'conversationId'
    );
  }

  /**
   * عقد:
   * close(input)
   *
   * الهدف:
   * إنهاء المحادثة النشطة.
   *
   * المدخل:
   * {
   *   conversationId: string,
   *   status: 'completed'|'abandoned'|'handoff',
   *   state?: object,
   *   reason?: string|null
   * }
   *
   * المخرج:
   * Conversation
   */
  static assertCloseInput(input) {
    this.assertObject(input, 'close input');

    const allowedClosedStatuses = new Set([
      'completed',
      'abandoned',
      'handoff',
    ]);

    const status =
      typeof input.status === 'string'
        ? input.status.trim().toLowerCase()
        : '';

    if (!allowedClosedStatuses.has(status)) {
      throw new ValidationError(
        'close status must be completed, abandoned, or handoff.'
      );
    }

    return {
      conversationId: this.requireString(
        input.conversationId,
        'conversationId'
      ),

      status,

      state: this.normalizeObject(input.state),

      reason: this.normalizeNullableString(
        input.reason
      ),
    };
  }

  /**
   * يتحقق من شكل سجل المحادثة الخارج من Repository.
   */
  static assertConversation(conversation, {
    nullable = false,
  } = {}) {
    if (conversation === null && nullable) {
      return null;
    }

    this.assertObject(
      conversation,
      'conversation'
    );

    this.requireString(
      conversation.id,
      'conversation.id'
    );

    this.requireString(
      conversation.channel,
      'conversation.channel'
    );

    this.requireString(
      conversation.senderId,
      'conversation.senderId'
    );

    this.requireString(
      conversation.receiverId,
      'conversation.receiverId'
    );

    this.requireString(
      conversation.status,
      'conversation.status'
    );

    if (
      !conversation.state ||
      typeof conversation.state !== 'object' ||
      Array.isArray(conversation.state)
    ) {
      throw new ValidationError(
        'conversation.state must be a valid object.'
      );
    }

    return conversation;
  }

  static normalizeStatus(value) {
    const allowedStatuses = new Set([
      'active',
      'completed',
      'abandoned',
      'handoff',
    ]);

    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return 'active';
    }

    if (typeof value !== 'string') {
      throw new ValidationError(
        'status must be a string.'
      );
    }

    const normalizedStatus =
      value.trim().toLowerCase();

    if (!allowedStatuses.has(normalizedStatus)) {
      throw new ValidationError(
        'Invalid conversation status.'
      );
    }

    return normalizedStatus;
  }

  static assertObject(value, fieldName) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw new ValidationError(
        `${fieldName} must be a valid object.`
      );
    }

    return value;
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

  static normalizeNullableString(value) {
    if (
      value === undefined ||
      value === null
    ) {
      return null;
    }

    if (typeof value !== 'string') {
      return null;
    }

    return value.trim() || null;
  }

  static requireString(value, fieldName) {
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
}

module.exports = ConversationRepositoryContract;