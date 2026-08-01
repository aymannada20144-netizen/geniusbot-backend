'use strict';

const KEYS = Object.freeze(['assistant_name', 'assistant_gender']);

class AssistantIdentityRepository {
  constructor(db) {
    if (!db || typeof db.query !== 'function') {
      throw new TypeError('AssistantIdentityRepository requires query().');
    }
    this.db = db;
  }

  async findByClinicId(clinicId, executor = this.db) {
    const result = await executor.query(
      `SELECT setting_key, setting_value, updated_at
       FROM geniusbot.bot_settings
       WHERE clinic_id = $1 AND setting_key = ANY($2::varchar[])
       ORDER BY setting_key`,
      [clinicId, KEYS]
    );
    return result.rows;
  }

  async clinicExists(clinicId, executor = this.db) {
    const result = await executor.query(
      'SELECT 1 FROM geniusbot.clinics WHERE id = $1 LIMIT 1',
      [clinicId]
    );
    return result.rowCount === 1;
  }

  update(clinicId, identity, expectedUpdatedAt) {
    if (typeof this.db.transaction !== 'function') {
      throw new TypeError('Assistant identity updates require transaction().');
    }
    return this.db.transaction(async (client) => {
      if (!await this.clinicExists(clinicId, client)) return null;
      const locked = await client.query(
        `SELECT setting_key, setting_value, updated_at
         FROM geniusbot.bot_settings
         WHERE clinic_id = $1 AND setting_key = ANY($2::varchar[])
         ORDER BY setting_key FOR UPDATE`,
        [clinicId, KEYS]
      );
      const currentRevision = latestRevision(locked.rows);
      if (expectedUpdatedAt && currentRevision !== expectedUpdatedAt) {
        return { conflict: true, rows: locked.rows };
      }
      const updatedAt = new Date();
      await client.query(
        `INSERT INTO geniusbot.bot_settings
           (clinic_id, setting_key, setting_value, updated_at)
         VALUES ($1, 'assistant_name', $2, $4),
                ($1, 'assistant_gender', $3, $4)
         ON CONFLICT (clinic_id, setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value,
                       updated_at = EXCLUDED.updated_at`,
        [clinicId, identity.assistantName, identity.assistantGender, updatedAt]
      );
      return { conflict: false, rows: await this.findByClinicId(clinicId, client) };
    });
  }
}

function latestRevision(rows) {
  if (!rows.length) return null;
  return rows.reduce((latest, row) => {
    const value = new Date(row.updated_at).toISOString();
    return !latest || value > latest ? value : latest;
  }, null);
}

module.exports = AssistantIdentityRepository;
module.exports.latestRevision = latestRevision;
