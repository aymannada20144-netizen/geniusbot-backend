'use strict';

/**
 * ContextBuilder
 *
 * المنسق الرئيسي المسؤول عن بناء السياق الكامل للمحادثة.
 *
 * لا يتعامل مباشرة مع قاعدة البيانات، ولا يحتوي على منطق حجز،
 * ولا يستدعي الذكاء الاصطناعي.
 *
 * يعتمد على Builders فرعية عبر Dependency Injection.
 */
class ContextBuilder {
  constructor({
    conversationContextBuilder,
    patientContextBuilder,
    operationalContextBuilder,
  } = {}) {
    this.#assertDependency(
      conversationContextBuilder,
      'conversationContextBuilder'
    );

    this.#assertDependency(
      patientContextBuilder,
      'patientContextBuilder'
    );

    this.#assertDependency(
      operationalContextBuilder,
      'operationalContextBuilder'
    );

    this.conversationContextBuilder = conversationContextBuilder;
    this.patientContextBuilder = patientContextBuilder;
    this.operationalContextBuilder = operationalContextBuilder;
  }

  /**
   * يبني السياق الكامل المطلوب لمعالجة رسالة واردة.
   *
   * @param {Object} input
   * @param {string} input.clinicId
   * @param {string|null} [input.branchId]
   * @param {string} input.channel
   * @param {string} input.channelIdentity
   * @param {Object} input.message
   *
   * @returns {Promise<Object>}
   */
  async build(input = {}) {
    const normalizedInput = this.#validateAndNormalizeInput(input);

    /*
     * نبني سياق المحادثة أولًا؛ لأنه قد يحتوي على:
     * conversationId
     * patientId
     * currentState
     * metadata
     */
    const conversationContext =
      await this.conversationContextBuilder.build(normalizedInput);

    const patientContext = await this.patientContextBuilder.build({
      ...normalizedInput,
      conversation: conversationContext.conversation,
      patientId:
        conversationContext.patientId ??
        conversationContext.conversation?.patientId ??
        null,
    });

    const operationalContext =
      await this.operationalContextBuilder.build({
        ...normalizedInput,
        conversation: conversationContext.conversation,
        patient: patientContext.patient,
      });

    return this.#buildContext({
      input: normalizedInput,
      conversationContext,
      patientContext,
      operationalContext,
    });
  }

  /**
   * يوحد نتائج الـ Builders الفرعية داخل عقد Context ثابت.
   *
   * @private
   */
  #buildContext({
    input,
    conversationContext,
    patientContext,
    operationalContext,
  }) {
    return {
      request: {
        clinicId: input.clinicId,
        branchId: input.branchId,
        channel: input.channel,
        channelIdentity: input.channelIdentity,
        message: input.message,
      },

      clinic: operationalContext.clinic ?? null,
      branch: operationalContext.branch ?? null,

      patient: patientContext.patient ?? null,

      conversation: conversationContext.conversation ?? null,

      state: conversationContext.state ?? {
        current: null,
        data: {},
      },

      persona: operationalContext.persona ?? null,

      recentMessages: Array.isArray(
        conversationContext.recentMessages
      )
        ? conversationContext.recentMessages
        : [],

      operationalData: {
        services: Array.isArray(operationalContext.services)
          ? operationalContext.services
          : [],

        doctors: Array.isArray(operationalContext.doctors)
          ? operationalContext.doctors
          : [],

        rooms: Array.isArray(operationalContext.rooms)
          ? operationalContext.rooms
          : [],

        workingHours: Array.isArray(
          operationalContext.workingHours
        )
          ? operationalContext.workingHours
          : [],

        holidays: Array.isArray(operationalContext.holidays)
          ? operationalContext.holidays
          : [],
      },

      metadata: {
        builtAt: new Date().toISOString(),

        isKnownPatient: Boolean(patientContext.patient),

        isExistingConversation: Boolean(
          conversationContext.isExistingConversation
        ),
      },
    };
  }

  /**
   * يتحقق من مدخلات بناء السياق ويوحدها.
   *
   * @private
   */
  #validateAndNormalizeInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError(
        'ContextBuilder input must be an object.'
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
        'ContextBuilder message must be an object.'
      );
    }

    return {
      clinicId,
      branchId:
        typeof input.branchId === 'string' &&
        input.branchId.trim()
          ? input.branchId.trim()
          : null,

      channel,
      channelIdentity,
      message: { ...input.message },
    };
  }

  /**
   * يتحقق من Dependency مطلوبة.
   *
   * @private
   */
  #assertDependency(dependency, dependencyName) {
    if (!dependency || typeof dependency.build !== 'function') {
      throw new TypeError(
        `ContextBuilder requires ${dependencyName} with a build() method.`
      );
    }
  }

  /**
   * يتحقق من قيمة نصية مطلوبة.
   *
   * @private
   */
  #requireString(value, fieldName) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new TypeError(
        `ContextBuilder requires a valid ${fieldName}.`
      );
    }

    return value.trim();
  }
}

module.exports = ContextBuilder;