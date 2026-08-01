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
      clinicId,
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
    if (!clinicId) {
      throw new Error(
        'ServiceAssignmentRepository.findAssignments requires clinicId'
      );
    }

    if (!serviceId) {
      throw new Error(
        'ServiceAssignmentRepository.findAssignments requires serviceId'
      );
    }

    const conditions = [
      'sa."clinic_id" = $1',
      'sa."branch_id" = $2',
      'sa."service_id" = $3',
    ];

    const values = [
      clinicId,
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
        r."is_active" AS "room_is_active",
        s."requires_doctor",
        s."requires_room"
      FROM ${this.fullTableName} sa
      JOIN "geniusbot"."clinics" c
        ON c."id" = sa."clinic_id" AND c."is_active" = TRUE
      JOIN "geniusbot"."branches" b
        ON b."id" = sa."branch_id"
       AND b."clinic_id" = sa."clinic_id"
       AND b."is_active" = TRUE
      JOIN "geniusbot"."services" s
        ON s."id" = sa."service_id"
       AND s."clinic_id" = sa."clinic_id"
       AND s."is_active" = TRUE
       AND s."is_booking_enabled" = TRUE
      LEFT JOIN "geniusbot"."doctors" d
        ON d."id" = sa."doctor_id"
      LEFT JOIN "geniusbot"."rooms" r
        ON r."id" = sa."room_id"
      WHERE ${conditions.join('\n        AND ')}
        AND (sa."doctor_id" IS NULL OR d."is_active" = TRUE)
        AND (sa."room_id" IS NULL OR (
          r."is_active" = TRUE AND r."branch_id" = sa."branch_id"
        ))
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
    clinicId,
    branchId,
    serviceId
  ) {
    const assignments =
      await this.findAssignments({
        clinicId,
        branchId,
        serviceId,
        activeOnly: true,
        defaultFirst: true,
      });

    return assignments.find((assignment) => assignment.is_default === true) || null;
  }
}

module.exports = ServiceAssignmentRepository;
