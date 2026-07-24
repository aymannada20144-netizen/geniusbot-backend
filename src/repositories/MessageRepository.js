const BaseRepository = require('../core/BaseRepository');

class MessageRepository extends BaseRepository {
  constructor(db) {
    super(db, 'messages');
  }

  /**
   * يعيد آخر رسائل المحادثة مرتبة زمنيًا من الأقدم إلى الأحدث.
   *
   * يتم جلب أحدث الرسائل أولًا داخل الاستعلام الداخلي للاستفادة من
   * فهرس (conversation_id, created_at)، ثم يعاد ترتيب النتيجة تصاعديًا
   * لتكون جاهزة للاستخدام داخل سياق المحادثة.
   *
   * @param {Object} input
   * @param {string} input.conversationId
   * @param {number} [input.limit=20]
   * @returns {Promise<Array<Object>>}
   */
  async getRecentMessages({ conversationId, limit = 20 } = {}) {
    this.#assertRequiredString(conversationId, 'conversationId');

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new TypeError(
        'MessageRepository.getRecentMessages requires limit to be an integer between 1 and 100.'
      );
    }

    const sql = `
      SELECT
        recent_messages.id,
        recent_messages.conversation_id AS "conversationId",
        recent_messages.wa_message_id AS "waMessageId",
        recent_messages.sender_type AS "senderType",
        recent_messages.message_text AS "messageText",
        recent_messages.intent_id AS "intentId",
        recent_messages.detected_intent_text AS "detectedIntentText",
        recent_messages.raw_payload AS "rawPayload",
        recent_messages.created_at AS "createdAt"
      FROM (
        SELECT
          m.id,
          m.conversation_id,
          m.wa_message_id,
          m.sender_type,
          m.message_text,
          m.intent_id,
          m.detected_intent_text,
          m.raw_payload,
          m.created_at
        FROM ${this.fullTableName} AS m
        WHERE m.conversation_id = $1
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $2
      ) AS recent_messages
      ORDER BY
        recent_messages.created_at ASC,
        recent_messages.id ASC
    `;

    const result = await this.query(sql, [
      conversationId.trim(),
      limit,
    ]);

    return result.rows;
  }

  /**
   * يحفظ رسالة واردة من المريض.
   *
   * wa_message_id هو مفتاح منع التكرار القادم من WhatsApp.
   * عند استقبال Webhook مكرر، لا يتم إنشاء سجل جديد، بل يعاد السجل
   * الموجود بالفعل لنفس wa_message_id.
   *
   * @param {Object} input
   * @param {string} input.conversationId
   * @param {string} input.waMessageId
   * @param {string|null} [input.messageText=null]
   * @param {string|null} [input.intentId=null]
   * @param {string|null} [input.detectedIntentText=null]
   * @param {Object|null} [input.rawPayload=null]
   * @returns {Promise<Object>}
   */
  async saveIncomingMessage({
    conversationId,
    waMessageId,
    messageText = null,
    intentId = null,
    detectedIntentText = null,
    rawPayload = null,
  } = {}) {
    this.#assertRequiredString(conversationId, 'conversationId');
    this.#assertRequiredString(waMessageId, 'waMessageId');

    const normalizedMessageText = this.#normalizeNullableString(
      messageText,
      'messageText'
    );

    const normalizedIntentId = this.#normalizeNullableString(
      intentId,
      'intentId'
    );

    const normalizedDetectedIntentText =
      this.#normalizeNullableString(
        detectedIntentText,
        'detectedIntentText'
      );

    const normalizedRawPayload = this.#normalizeNullableObject(
      rawPayload,
      'rawPayload'
    );

    const sql = `
      WITH inserted_message AS (
        INSERT INTO ${this.fullTableName} (
          conversation_id,
          wa_message_id,
          sender_type,
          message_text,
          intent_id,
          detected_intent_text,
          raw_payload
        )
        VALUES (
          $1,
          $2,
          'patient',
          $3,
          $4,
          $5,
          $6::jsonb
        )
        ON CONFLICT (wa_message_id)
        DO NOTHING
        RETURNING
          id,
          conversation_id,
          wa_message_id,
          sender_type,
          message_text,
          intent_id,
          detected_intent_text,
          raw_payload,
          created_at
      )
      SELECT
        stored_message.id,
        stored_message.conversation_id AS "conversationId",
        stored_message.wa_message_id AS "waMessageId",
        stored_message.sender_type AS "senderType",
        stored_message.message_text AS "messageText",
        stored_message.intent_id AS "intentId",
        stored_message.detected_intent_text AS "detectedIntentText",
        stored_message.raw_payload AS "rawPayload",
        stored_message.created_at AS "createdAt"
      FROM (
        SELECT
          inserted_message.id,
          inserted_message.conversation_id,
          inserted_message.wa_message_id,
          inserted_message.sender_type,
          inserted_message.message_text,
          inserted_message.intent_id,
          inserted_message.detected_intent_text,
          inserted_message.raw_payload,
          inserted_message.created_at
        FROM inserted_message

        UNION ALL

        SELECT
          existing_message.id,
          existing_message.conversation_id,
          existing_message.wa_message_id,
          existing_message.sender_type,
          existing_message.message_text,
          existing_message.intent_id,
          existing_message.detected_intent_text,
          existing_message.raw_payload,
          existing_message.created_at
        FROM ${this.fullTableName} AS existing_message
        WHERE existing_message.wa_message_id = $2
          AND NOT EXISTS (
            SELECT 1
            FROM inserted_message
          )
      ) AS stored_message
      LIMIT 1
    `;

    const result = await this.query(sql, [
      conversationId.trim(),
      waMessageId.trim(),
      normalizedMessageText,
      normalizedIntentId,
      normalizedDetectedIntentText,
      normalizedRawPayload === null
        ? null
        : JSON.stringify(normalizedRawPayload),
    ]);

    const message = result.rows[0];

    if (!message) {
      throw new Error(
        'MessageRepository failed to save or retrieve the incoming message.'
      );
    }

    if (message.conversationId !== conversationId.trim()) {
      throw new Error(
        'The supplied waMessageId already belongs to another conversation.'
      );
    }

    return message;
  }

  /**
   * يحفظ رسالة صادرة من شادن.
   *
   * يمكن حفظ الرسالة قبل إرسالها إلى WhatsApp دون wa_message_id،
   * أو بعد الإرسال مع معرف الرسالة الذي أعاده مزود WhatsApp.
   *
   * عند تمرير wa_message_id مكرر، يعاد السجل الموجود بدل إنشاء نسخة
   * إضافية.
   *
   * @param {Object} input
   * @param {string} input.conversationId
   * @param {string} input.messageText
   * @param {string|null} [input.waMessageId=null]
   * @param {string|null} [input.intentId=null]
   * @param {string|null} [input.detectedIntentText=null]
   * @param {Object|null} [input.rawPayload=null]
   * @returns {Promise<Object>}
   */
  async saveOutgoingMessage({
    conversationId,
    messageText,
    waMessageId = null,
    intentId = null,
    detectedIntentText = null,
    rawPayload = null,
  } = {}) {
    this.#assertRequiredString(conversationId, 'conversationId');
    this.#assertRequiredString(messageText, 'messageText');

    const normalizedWaMessageId = this.#normalizeNullableString(
      waMessageId,
      'waMessageId'
    );

    const normalizedIntentId = this.#normalizeNullableString(
      intentId,
      'intentId'
    );

    const normalizedDetectedIntentText =
      this.#normalizeNullableString(
        detectedIntentText,
        'detectedIntentText'
      );

    const normalizedRawPayload = this.#normalizeNullableObject(
      rawPayload,
      'rawPayload'
    );

    const sql = `
      WITH inserted_message AS (
        INSERT INTO ${this.fullTableName} (
          conversation_id,
          wa_message_id,
          sender_type,
          message_text,
          intent_id,
          detected_intent_text,
          raw_payload
        )
        VALUES (
          $1,
          $2,
          'bot',
          $3,
          $4,
          $5,
          $6::jsonb
        )
        ON CONFLICT (wa_message_id)
        DO NOTHING
        RETURNING
          id,
          conversation_id,
          wa_message_id,
          sender_type,
          message_text,
          intent_id,
          detected_intent_text,
          raw_payload,
          created_at
      )
      SELECT
        stored_message.id,
        stored_message.conversation_id AS "conversationId",
        stored_message.wa_message_id AS "waMessageId",
        stored_message.sender_type AS "senderType",
        stored_message.message_text AS "messageText",
        stored_message.intent_id AS "intentId",
        stored_message.detected_intent_text AS "detectedIntentText",
        stored_message.raw_payload AS "rawPayload",
        stored_message.created_at AS "createdAt"
      FROM (
        SELECT
          inserted_message.id,
          inserted_message.conversation_id,
          inserted_message.wa_message_id,
          inserted_message.sender_type,
          inserted_message.message_text,
          inserted_message.intent_id,
          inserted_message.detected_intent_text,
          inserted_message.raw_payload,
          inserted_message.created_at
        FROM inserted_message

        UNION ALL

        SELECT
          existing_message.id,
          existing_message.conversation_id,
          existing_message.wa_message_id,
          existing_message.sender_type,
          existing_message.message_text,
          existing_message.intent_id,
          existing_message.detected_intent_text,
          existing_message.raw_payload,
          existing_message.created_at
        FROM ${this.fullTableName} AS existing_message
        WHERE $2 IS NOT NULL
          AND existing_message.wa_message_id = $2
          AND NOT EXISTS (
            SELECT 1
            FROM inserted_message
          )
      ) AS stored_message
      LIMIT 1
    `;

    const result = await this.query(sql, [
      conversationId.trim(),
      normalizedWaMessageId,
      messageText.trim(),
      normalizedIntentId,
      normalizedDetectedIntentText,
      normalizedRawPayload === null
        ? null
        : JSON.stringify(normalizedRawPayload),
    ]);

    const message = result.rows[0];

    if (!message) {
      throw new Error(
        'MessageRepository failed to save or retrieve the outgoing message.'
      );
    }

    if (message.conversationId !== conversationId.trim()) {
      throw new Error(
        'The supplied waMessageId already belongs to another conversation.'
      );
    }

    return message;
  }

  async saveStaffMessage({ conversationId, messageText, waMessageId, staffId } = {}) {
    this.#assertRequiredString(conversationId, 'conversationId');
    this.#assertRequiredString(messageText, 'messageText');
    this.#assertRequiredString(waMessageId, 'waMessageId');
    this.#assertRequiredString(staffId, 'staffId');
    const result = await this.query(`
      INSERT INTO ${this.fullTableName} (
        conversation_id, wa_message_id, sender_type, message_text, raw_payload
      ) VALUES ($1, $2, 'staff', $3, $4::jsonb)
      RETURNING id, conversation_id AS "conversationId",
        wa_message_id AS "waMessageId", sender_type AS "senderType",
        message_text AS "messageText", created_at AS "createdAt"
    `, [conversationId.trim(), waMessageId.trim(), messageText.trim(),
      JSON.stringify({ staffId })]);
    return result.rows[0];
  }

  async findByExternalId(conversationId, waMessageId) {
    this.#assertRequiredString(conversationId, 'conversationId');
    this.#assertRequiredString(waMessageId, 'waMessageId');
    const result = await this.query(`
      SELECT id FROM ${this.fullTableName}
      WHERE conversation_id = $1 AND wa_message_id = $2
      LIMIT 1
    `, [conversationId.trim(), waMessageId.trim()]);
    return result.rows[0] || null;
  }

  #assertRequiredString(value, fieldName) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new TypeError(
        `MessageRepository requires a valid ${fieldName}.`
      );
    }
  }

  #normalizeNullableString(value, fieldName) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new TypeError(
        `MessageRepository requires ${fieldName} to be a string or null.`
      );
    }

    const normalizedValue = value.trim();

    return normalizedValue || null;
  }

  #normalizeNullableObject(value, fieldName) {
    if (value === null || value === undefined) {
      return null;
    }

    if (
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw new TypeError(
        `MessageRepository requires ${fieldName} to be an object or null.`
      );
    }

    return { ...value };
  }
}

module.exports = MessageRepository;
