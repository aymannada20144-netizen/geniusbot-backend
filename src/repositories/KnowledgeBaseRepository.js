'use strict';

const BaseRepository = require('../core/BaseRepository');

class KnowledgeBaseRepository extends BaseRepository {
  constructor(db) {
    super(db, 'knowledge_base');
  }

  async findEligibleCandidates({ clinicId, serviceId = null, category }) {
    const hasService = serviceId !== null;
    const servicePredicate = hasService
      ? '(service_id = $3 OR service_id IS NULL)'
      : 'service_id IS NULL';
    const parameters = hasService
      ? [clinicId, category, serviceId]
      : [clinicId, category];

    const sql = `
      SELECT
        id,
        service_id,
        title,
        content,
        category,
        keywords,
        priority
      FROM ${this.fullTableName}
      WHERE clinic_id = $1
        AND is_active IS TRUE
        AND category = $2
        AND ${servicePredicate}
    `;

    const result = await this.query(sql, parameters);
    return result.rows;
  }
}

module.exports = KnowledgeBaseRepository;
