'use strict';

const BATCH_SIZE = 10;

class OutboxRepository {
  constructor(db) {
    if (!db || typeof db.query !== 'function') {
      throw new TypeError('OutboxRepository requires db.query().');
    }
    this.db = db;
  }

  async findUnpublished() {
    const result = await this.db.query(
      `
        SELECT id, event_name, payload
        FROM geniusbot.outbox_events
        WHERE published_at IS NULL
        ORDER BY occurred_at ASC, id ASC
        LIMIT $1
      `,
      [BATCH_SIZE]
    );
    return result.rows;
  }

  async markPublished(id) {
    const result = await this.db.query(
      `
        UPDATE geniusbot.outbox_events
        SET published_at = NOW()
        WHERE id = $1
          AND published_at IS NULL
        RETURNING id
      `,
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = OutboxRepository;
