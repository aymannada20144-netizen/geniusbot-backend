const BaseRepository = require('../core/BaseRepository');

class ServiceAssignmentRepository extends BaseRepository {
  constructor(db) {
    super(db, 'service_assignments');
  }

  /**
   * يعيد تعيينات الخدمة المطابقة للفلاتر.
   *
   * المسؤولية هنا تقتصر على جلب البيانات فقط.
   * اختيار أفضل تعيين وفحص التوافر مسؤولية
   * BookingAssignmentResolver.
   *
   * الفلاتر المدعومة حاليًا:
   * - branchId
   * - serviceId
   * - doctorId
   * - roomId
   * - activeOnly
   * - defaultFirst
   * - limit
   * - offset
   */
  async findAssignments(filters = {}) {
    const {
      branchId,
      serviceId,
      doctorId = null,
      roomId = null,
      activeOnly = true,
      defaultFirst = true,
      limit = null,
      offset = 0,
    } = filters;

    if (!branchId) {
      throw new Error(
        'ServiceAssignmentRepository.findAssignments requires branchId'
      );
    }

    if (!serviceId) {
      throw new Error(
        'ServiceAssignmentRepository.findAssignments requires serviceId'
      );
    }

    const conditions = [
      'sa."branch_id" = $1',
      'sa."service_id" = $2',
    ];

    const values = [
      branchId,
      serviceId,
    ];

    if (doctorId) {
      values.push(doctorId);

      conditions.push(
        `sa."doctor_id" = $${values.length}`
      );
    }

    if (roomId) {
      values.push(roomId);

      conditions.push(
        `sa."room_id" = $${values.length}`
      );
    }

    if (activeOnly) {
      conditions.push(
        'sa."is_active" = TRUE'
      );
    }

    let sql = `
      SELECT
        sa.*,
        d."full_name" AS "doctor_name",
        d."is_active" AS "doctor_is_active",
        r."room_number",
        r."room_name",
        r."is_active" AS "room_is_active"
      FROM ${this.fullTableName} sa
      LEFT JOIN "geniusbot"."doctors" d
        ON d."id" = sa."doctor_id"
      LEFT JOIN "geniusbot"."rooms" r
        ON r."id" = sa."room_id"
      WHERE ${conditions.join('\n        AND ')}
    `;

    if (defaultFirst) {
      sql += `
        ORDER BY
          sa."is_default" DESC,
          sa."created_at" ASC,
          sa."id" ASC
      `;
    } else {
      sql += `
        ORDER BY
          sa."created_at" ASC,
          sa."id" ASC
      `;
    }

    if (limit !== null && limit !== undefined) {
      const normalizedLimit = Number(limit);

      if (
        !Number.isInteger(normalizedLimit) ||
        normalizedLimit <= 0
      ) {
        throw new Error(
          'ServiceAssignmentRepository.findAssignments limit must be a positive integer'
        );
      }

      values.push(normalizedLimit);

      sql += `
        LIMIT $${values.length}
      `;
    }

    const normalizedOffset = Number(offset);

    if (
      !Number.isInteger(normalizedOffset) ||
      normalizedOffset < 0
    ) {
      throw new Error(
        'ServiceAssignmentRepository.findAssignments offset must be a non-negative integer'
      );
    }

    if (normalizedOffset > 0) {
      values.push(normalizedOffset);

      sql += `
        OFFSET $${values.length}
      `;
    }

    const result = await this.query(
      sql,
      values
    );

    return result.rows;
  }

  /**
   * توافق مؤقت مع BookingOrchestrator الحالي.
   *
   * لا تُحذف هذه الدالة حتى:
   * 1. ربط BookingAssignmentResolver.
   * 2. نجاح اختبارات الحجز السابقة.
   * 3. تجميد Booking Engine Core.
   */
  async findDefaultAssignment(
    branchId,
    serviceId
  ) {
    const assignments =
      await this.findAssignments({
        branchId,
        serviceId,
        activeOnly: true,
        defaultFirst: true,
        limit: 1,
      });

    return assignments[0] || null;
  }
}

module.exports = ServiceAssignmentRepository;