'use strict';

class CustomerMemoryRepository {
  constructor(db) {
    if (!db || typeof db.query !== 'function') {
      throw new TypeError('CustomerMemoryRepository requires db.query().');
    }
    this.db = db;
  }

  async listActive({ clinicId, patientId, limit = 12 } = {}) {
    if (!clinicId || !patientId) return [];
    const result = await this.db.query(`
      SELECT memory_key AS "memoryKey", memory_type AS "memoryType",
        value_json AS "value", evidence_level AS "evidenceLevel",
        source_conversation_id AS "sourceConversationId",
        source_message_id AS "sourceMessageId",
        first_observed_at AS "firstObservedAt",
        last_confirmed_at AS "lastConfirmedAt"
      FROM geniusbot.customer_memories
      WHERE clinic_id = $1 AND patient_id = $2 AND active = true
      ORDER BY last_confirmed_at DESC, id DESC
      LIMIT $3
    `, [clinicId, patientId, limit]);
    return result.rows;
  }

  async reconcile({ clinicId, patientId, memoryKey, memoryType, value,
    sourceConversationId, sourceMessageId = null, evidenceLevel = 'structured' } = {}) {
    if (!clinicId || !patientId || !memoryKey || !memoryType || !value ||
        !['patient_record', 'structured', 'contextual'].includes(evidenceLevel)) {
      throw new TypeError('Customer memory requires a supported structured fact.');
    }
    const result = await this.db.query(`
      INSERT INTO geniusbot.customer_memories (
        clinic_id, patient_id, memory_key, memory_type, value_json,
        source_conversation_id, source_message_id, evidence_level
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      ON CONFLICT (clinic_id, patient_id, memory_key) WHERE active = true
      DO UPDATE SET value_json = EXCLUDED.value_json,
        source_conversation_id = EXCLUDED.source_conversation_id,
        source_message_id = EXCLUDED.source_message_id,
        evidence_level = EXCLUDED.evidence_level,
        last_confirmed_at = NOW(), updated_at = NOW()
      RETURNING id, memory_key AS "memoryKey", memory_type AS "memoryType",
        value_json AS "value", active
    `, [clinicId, patientId, memoryKey, memoryType, JSON.stringify(value),
      sourceConversationId, sourceMessageId, evidenceLevel]);
    return result.rows[0];
  }

  async supersede({ clinicId, patientId, memoryType, replacementKey } = {}) {
    if (!clinicId || !patientId || !memoryType || !replacementKey) {
      throw new TypeError('Customer memory supersession requires a scoped replacement.');
    }
    await this.db.query(`
      UPDATE geniusbot.customer_memories
      SET active = false, updated_at = NOW()
      WHERE clinic_id = $1 AND patient_id = $2 AND memory_type = $3
        AND memory_key <> $4 AND active = true
    `, [clinicId, patientId, memoryType, replacementKey]);
  }

  async conversationTopics({ clinicId, patientId, currentConversationId } = {}) {
    if (!clinicId || !patientId || !currentConversationId) return { currentConversationTopic: null, previousConversationTopic: null };
    const result = await this.db.query(`
      SELECT value_json AS "value", source_conversation_id AS "sourceConversationId"
      FROM geniusbot.customer_memories
      WHERE clinic_id = $1 AND patient_id = $2 AND active = true
        AND memory_type = 'recent_conversation_topic'
      ORDER BY last_confirmed_at DESC, id DESC
    `, [clinicId, patientId]);
    const topics = result.rows;
    return {
      currentConversationTopic: topics.find((topic) => topic.sourceConversationId === currentConversationId) || null,
      previousConversationTopic: topics.find((topic) => topic.sourceConversationId !== currentConversationId) || null,
    };
  }
}

module.exports = CustomerMemoryRepository;
