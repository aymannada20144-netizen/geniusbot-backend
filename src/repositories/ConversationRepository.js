'use strict';

const BaseRepository = require('../core/BaseRepository');
const {
  normalizeSaudiMobile,
  normalizeSaudiMobileDigits,
} = require('../core/validators/saudiMobile');
const PatientIdentityConflictError = require(
  '../core/errors/PatientIdentityConflictError'
);

const NORMALIZED_PHONE_SQL = (column) => `
  CASE
    WHEN regexp_replace(${column}, '\\D', '', 'g') ~ '^009665[0-9]{8}$'
      THEN substring(regexp_replace(${column}, '\\D', '', 'g') FROM 3)
    WHEN regexp_replace(${column}, '\\D', '', 'g') ~ '^05[0-9]{8}$'
      THEN '966' || substring(regexp_replace(${column}, '\\D', '', 'g') FROM 2)
    WHEN regexp_replace(${column}, '\\D', '', 'g') ~ '^5[0-9]{8}$'
      THEN '966' || regexp_replace(${column}, '\\D', '', 'g')
    WHEN regexp_replace(${column}, '\\D', '', 'g') ~ '^9665[0-9]{8}$'
      THEN regexp_replace(${column}, '\\D', '', 'g')
    ELSE NULL
  END
`;

/**
 * ConversationRepository
 *
 * مسؤول عن الوصول إلى:
 * - geniusbot.conversations
 * - بيانات المريض اللازمة لتحديد المحادثة بواسطة هوية القناة.
 *
 * يعيد جميع سجلات المحادثة بصيغة camelCase.
 */
class ConversationRepository extends BaseRepository {
  constructor(db) {
    super(db, 'conversations');

    this.allowedOrderColumns = [
      'id',
      'started_at',
      'ended_at',
      'status',
    ];

    this.defaultOrderBy = 'started_at';
  }

  async findActiveByChannelIdentity(input = {}) {
    return this.findByChannelIdentity({
      clinicId: input.clinicId,
      channel: input.channel,
      channelIdentity: input.channelIdentity || input.senderId,
    });
  }

  async findForPatient(clinicId, patientId) {
    const result = await this.query(`
      SELECT c.*, p.full_name AS patient_name,
        p.phone_number AS patient_phone
      FROM ${this.fullTableName} c
      JOIN "geniusbot"."patients" p
        ON p.id = c.patient_id AND p.clinic_id = c.clinic_id
      WHERE c.clinic_id = $1 AND c.patient_id = $2
        AND c.status = 'open'
      ORDER BY c.started_at DESC LIMIT 1
    `, [clinicId, patientId]);
    return result.rows[0] || null;
  }

  async findForClinic(clinicId, conversationId) {
    const result = await this.query(`
      SELECT c.*, p.full_name AS patient_name,
        p.phone_number AS patient_phone,
        p.whatsapp_id AS patient_whatsapp_id
      FROM ${this.fullTableName} c
      JOIN "geniusbot"."patients" p
        ON p.id = c.patient_id AND p.clinic_id = c.clinic_id
      WHERE c.clinic_id = $1 AND c.id = $2 LIMIT 1
    `, [clinicId, conversationId]);
    return result.rows[0] || null;
  }

  async setHumanHandling(clinicId, conversationId, staffId) {
    const result = await this.query(`
      UPDATE ${this.fullTableName}
      SET bot_enabled = false, assigned_to_staff_id = $3,
        handover_at = COALESCE(handover_at, NOW())
      WHERE clinic_id = $1 AND id = $2 RETURNING *
    `, [clinicId, conversationId, staffId]);
    return result.rows[0] || null;
  }

  async setAiHandling(clinicId, conversationId) {
    const result = await this.query(`
      UPDATE ${this.fullTableName}
      SET bot_enabled = true, assigned_to_staff_id = NULL,
        handover_at = NULL, handover_reason = NULL
      WHERE clinic_id = $1 AND id = $2 RETURNING *
    `, [clinicId, conversationId]);
    return result.rows[0] || null;
  }

  /**
   * يبحث عن أحدث محادثة مفتوحة لهوية القناة داخل العيادة.
   *
   * هوية WhatsApp تُطابق:
   * - patients.whatsapp_id
   * - patients.phone_number
   *
   * @param {Object} input
   * @param {string} input.clinicId
   * @param {string} input.channel
   * @param {string} input.channelIdentity
   *
   * @returns {Promise<Object|null>}
   */
  async findByChannelIdentity({
    clinicId,
    channel,
    channelIdentity,
  } = {}) {
    this.#requireString(clinicId, 'clinicId');
    this.#requireString(channel, 'channel');
    this.#requireString(channelIdentity, 'channelIdentity');

    const normalizedIdentity = normalizeSaudiMobile(
      channelIdentity,
      'channelIdentity'
    );
    const patientId = await this.#findPatientIdByChannelIdentity({
      clinicId,
      channelIdentity: normalizedIdentity,
    });

    const sql = `
      SELECT
        c.id,
        c.clinic_id,
        c.patient_id,
        c.channel,
        c.status,
        c.assigned_to_staff_id,
        c.bot_enabled,
        c.current_state,
        c.state_payload,
        c.handover_at,
        c.handover_reason,
        c.started_at,
        c.ended_at
      FROM ${this.fullTableName} AS c
      WHERE c.clinic_id = $1
        AND c.channel = $2
        AND c.status = 'open'
        AND (
          c.state_payload ->> 'channelIdentity' = $3
          OR ($4::uuid IS NOT NULL AND c.patient_id = $4::uuid)
        )
      ORDER BY
        (c.state_payload ->> 'channelIdentity' = $3) DESC,
        c.started_at DESC
      LIMIT 1
    `;

    const result = await this.query(sql, [
      clinicId.trim(),
      channel.trim().toLowerCase(),
      normalizedIdentity,
      patientId,
    ]);

    return result.rows[0]
      ? this.#mapConversation(result.rows[0])
      : null;
  }

  /**
   * ينشئ محادثة جديدة.
   *
   * إذا كانت هوية القناة مرتبطة بمريض موجود،
   * تُربط المحادثة بالمريض.
   *
   * إذا لم يوجد مريض مطابق، تُنشأ المحادثة
   * بقيمة patient_id = null.
   *
   * @param {Object} input
   * @param {string} input.clinicId
   * @param {string} input.channel
   * @param {string} input.channelIdentity
   *
   * @returns {Promise<Object>}
   */
  async create({
    clinicId,
    channel,
    channelIdentity,
  } = {}) {
    this.#requireString(clinicId, 'clinicId');
    this.#requireString(channel, 'channel');
    this.#requireString(channelIdentity, 'channelIdentity');

    const normalizedClinicId = clinicId.trim();
    const normalizedChannel = channel.trim().toLowerCase();
    const normalizedChannelIdentity = normalizeSaudiMobile(
      channelIdentity,
      'channelIdentity'
    );

    const patientId = await this.#findPatientIdByChannelIdentity({
      clinicId: normalizedClinicId,
      channelIdentity: normalizedChannelIdentity,
    });

    const row = await super.create({
      clinic_id: normalizedClinicId,
      patient_id: patientId,
      channel: normalizedChannel,
      status: 'open',
      bot_enabled: true,
      current_state: null,
      state_payload: {
        channelIdentity: normalizedChannelIdentity,
      },
    });

    return this.#mapConversation(row);
  }

  /**
   * يحمل حالة المحادثة.
   *
   * @param {string} conversationId
   *
   * @returns {Promise<{
   *   current: string|null,
   *   data: Object
   * }|null>}
   */
  async loadState(conversationId) {
    this.#requireString(conversationId, 'conversationId');

    const sql = `
      SELECT
        current_state,
        state_payload
      FROM ${this.fullTableName}
      WHERE id = $1
      LIMIT 1
    `;

    const result = await this.query(sql, [
      conversationId.trim(),
    ]);

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      current: row.current_state ?? null,

      data: this.#normalizeStatePayload(
        row.state_payload
      ),
    };
  }

  /**
   * يحدث حالة المحادثة.
   *
   * @param {string} conversationId
   * @param {Object} state
   * @param {string|null} state.current
   * @param {Object} state.data
   *
   * @returns {Promise<{
   *   current: string|null,
   *   data: Object
   * }|null>}
   */
  async updateState(
    conversationId,
    {
      current = null,
      data = {},
    } = {}
  ) {
    this.#requireString(conversationId, 'conversationId');

    const normalizedCurrent =
      typeof current === 'string' && current.trim()
        ? current.trim()
        : null;

    const normalizedData =
      this.#normalizeStatePayload(data);

    const sql = `
      UPDATE ${this.fullTableName}
      SET
        current_state = $2,
        state_payload = $3::jsonb
      WHERE id = $1
      RETURNING
        current_state,
        state_payload
    `;

    const result = await this.query(sql, [
      conversationId.trim(),
      normalizedCurrent,
      JSON.stringify(normalizedData),
    ]);

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      current: row.current_state ?? null,

      data: this.#normalizeStatePayload(
        row.state_payload
      ),
    };
  }

  /**
   * يربط مريضًا بمحادثة موجودة.
   *
   * @param {string} conversationId
   * @param {string} patientId
   *
   * @returns {Promise<Object|null>}
   */
  async attachPatient(conversationId, patientId) {
    this.#requireString(conversationId, 'conversationId');
    this.#requireString(patientId, 'patientId');

    const sql = `
      UPDATE ${this.fullTableName}
      SET patient_id = $2
      WHERE id = $1
      RETURNING
        id,
        clinic_id,
        patient_id,
        channel,
        status,
        assigned_to_staff_id,
        bot_enabled,
        current_state,
        state_payload,
        handover_at,
        handover_reason,
        started_at,
        ended_at
    `;

    const result = await this.query(sql, [
      conversationId.trim(),
      patientId.trim(),
    ]);

    return result.rows[0]
      ? this.#mapConversation(result.rows[0])
      : null;
  }

  /**
   * يغلق محادثة مفتوحة.
   *
   * @param {string} conversationId
   *
   * @returns {Promise<Object|null>}
   */
  async close(conversationId) {
    this.#requireString(conversationId, 'conversationId');

    const sql = `
      UPDATE ${this.fullTableName}
      SET
        status = 'closed',
        ended_at = NOW()
      WHERE id = $1
        AND status = 'open'
      RETURNING
        id,
        clinic_id,
        patient_id,
        channel,
        status,
        assigned_to_staff_id,
        bot_enabled,
        current_state,
        state_payload,
        handover_at,
        handover_reason,
        started_at,
        ended_at
    `;

    const result = await this.query(sql, [
      conversationId.trim(),
    ]);

    return result.rows[0]
      ? this.#mapConversation(result.rows[0])
      : null;
  }

  /**
   * يبحث عن المريض المرتبط بهوية القناة.
   *
   * @private
   */
  async #findPatientIdByChannelIdentity({
    clinicId,
    channelIdentity,
  }) {
    const sql = `
      SELECT id
      FROM "geniusbot"."patients"
      WHERE clinic_id = $1
        AND is_active = true
        AND (
          (${NORMALIZED_PHONE_SQL('whatsapp_id')}) = $2
          OR (${NORMALIZED_PHONE_SQL('phone_number')}) = $2
        )
      ORDER BY created_at ASC, id ASC
    `;

    const result = await this.query(sql, [
      clinicId,
      normalizeSaudiMobileDigits(channelIdentity),
    ]);

    const patientIds = [...new Set(result.rows.map((row) => row.id))];
    if (patientIds.length > 1) {
      throw new PatientIdentityConflictError();
    }
    return patientIds[0] ?? null;
  }

  /**
   * يحول سجل PostgreSQL إلى العقد الداخلي المعتمد.
   *
   * @private
   */
  #mapConversation(row) {
    return {
      id: row.id,

      clinicId: row.clinic_id,

      patientId: row.patient_id ?? null,

      channel: row.channel,

      status: row.status,

      assignedToStaffId:
        row.assigned_to_staff_id ?? null,

      botEnabled: row.bot_enabled,

      currentState:
        row.current_state ?? null,

      statePayload:
        this.#normalizeStatePayload(
          row.state_payload
        ),

      handoverAt:
        row.handover_at ?? null,

      handoverReason:
        row.handover_reason ?? null,

      startedAt:
        row.started_at ?? null,

      endedAt:
        row.ended_at ?? null,
    };
  }

  /**
   * يضمن أن state_payload كائن JSON صالح.
   *
   * @private
   */
  #normalizeStatePayload(value) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return {};
    }

    return { ...value };
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
        `ConversationRepository requires a valid ${fieldName}.`
      );
    }

    return value.trim();
  }
}

module.exports = ConversationRepository;
