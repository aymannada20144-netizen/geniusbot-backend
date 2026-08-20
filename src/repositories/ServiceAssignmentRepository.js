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

  async listActiveServiceBranchPairs(clinicId) {
    const assignments = await this.listActiveDomainAssignments(clinicId);
    const seen = new Set();
    return assignments.reduce((pairs, item) => {
      const key = `${item.service_id}:${item.branch_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ service_id: item.service_id, branch_id: item.branch_id });
      }
      return pairs;
    }, []);
  }

  async listActiveDomainAssignments(clinicId) {
    if (!clinicId) {
      throw new Error(
        'ServiceAssignmentRepository.listActiveDomainAssignments requires clinicId'
      );
    }
    const result = await this.query(
      `SELECT DISTINCT sa."service_id", sa."branch_id", sa."doctor_id"
         FROM ${this.fullTableName} sa
         JOIN "geniusbot"."branches" b
           ON b."id" = sa."branch_id"
          AND b."clinic_id" = sa."clinic_id"
          AND b."is_active" = TRUE
         JOIN "geniusbot"."services" s
           ON s."id" = sa."service_id"
          AND s."clinic_id" = sa."clinic_id"
          AND s."is_active" = TRUE
          AND s."is_booking_enabled" = TRUE
        WHERE sa."clinic_id" = $1
          AND sa."is_active" = TRUE`,
      [clinicId]
    );
    return result.rows;
  }

  async findAvailabilityWindow({
    clinicId,
    branchId,
    serviceId,
    doctorId = null,
    roomId = null,
    windowStart,
    windowEnd,
    timeZone,
    excludeAppointmentId = null,
  }) {
    const result = await this.query(
      `WITH eligible_assignments AS (
         SELECT sa.*, s.requires_doctor, s.requires_room
           FROM geniusbot.service_assignments sa
           JOIN geniusbot.services s
             ON s.id = sa.service_id
            AND s.clinic_id = sa.clinic_id
            AND s.is_active IS TRUE
            AND s.is_booking_enabled IS TRUE
           LEFT JOIN geniusbot.doctors d ON d.id = sa.doctor_id
           LEFT JOIN geniusbot.rooms r ON r.id = sa.room_id
          WHERE sa.clinic_id = $1
            AND sa.branch_id = $2
            AND sa.service_id = $3
            AND sa.is_active IS TRUE
            AND ($4::uuid IS NULL OR sa.doctor_id = $4)
            AND ($9::uuid IS NULL OR sa.room_id = $9)
            AND (sa.doctor_id IS NULL OR d.is_active IS TRUE)
            AND (sa.room_id IS NULL OR (
              r.is_active IS TRUE AND r.branch_id = sa.branch_id
            ))
       )
       SELECT
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'id', ea.id,
                       'doctor_id', ea.doctor_id,
                       'room_id', ea.room_id,
                       'requires_doctor', ea.requires_doctor,
                       'requires_room', ea.requires_room
                     ) ORDER BY ea.is_default DESC, ea.created_at, ea.id)
                     FROM eligible_assignments ea), '[]'::jsonb) AS assignments,
         COALESCE((SELECT jsonb_agg(to_jsonb(bwh) ORDER BY bwh.day_of_week)
                     FROM geniusbot.branch_working_hours bwh
                    WHERE bwh.branch_id = $2), '[]'::jsonb) AS branch_hours,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'doctor_id', dwh.doctor_id,
                       'day_of_week', dwh.day_of_week,
                       'start_time', dwh.start_time,
                       'end_time', dwh.end_time
                     ) ORDER BY dwh.day_of_week, dwh.start_time)
                     FROM geniusbot.doctor_working_hours dwh
                    WHERE dwh.branch_id = $2
                      AND dwh.is_active IS TRUE
                      AND dwh.doctor_id IN (
                        SELECT doctor_id FROM eligible_assignments WHERE doctor_id IS NOT NULL
                      )), '[]'::jsonb) AS doctor_hours,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'doctor_id', dto.doctor_id,
                       'start_datetime', dto.start_datetime,
                       'end_datetime', dto.end_datetime
                     ) ORDER BY dto.start_datetime)
                     FROM geniusbot.doctor_time_off dto
                    WHERE dto.doctor_id IN (
                            SELECT doctor_id FROM eligible_assignments WHERE doctor_id IS NOT NULL
                          )
                      AND dto.start_datetime < $6
                      AND dto.end_datetime > $5), '[]'::jsonb) AS doctor_time_off,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'room_id', rto.room_id,
                       'start_datetime', rto.start_datetime,
                       'end_datetime', rto.end_datetime
                     ) ORDER BY rto.start_datetime)
                     FROM geniusbot.room_time_off rto
                    WHERE rto.room_id IN (
                            SELECT room_id FROM eligible_assignments WHERE room_id IS NOT NULL
                          )
                      AND rto.start_datetime < $6
                      AND rto.end_datetime > $5), '[]'::jsonb) AS room_time_off,
         COALESCE((SELECT jsonb_agg(to_jsonb(ch) ORDER BY ch.holiday_date, ch.branch_id DESC NULLS LAST)
                     FROM geniusbot.clinic_holidays ch
                    WHERE ch.clinic_id = $1
                      AND (ch.branch_id = $2 OR ch.branch_id IS NULL)
                      AND ch.holiday_date >= ($5 AT TIME ZONE $7)::date
                      AND ch.holiday_date < ($6 AT TIME ZONE $7)::date), '[]'::jsonb) AS holidays,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'doctor_id', a.doctor_id,
                       'room_id', a.room_id,
                       'appointment_start', a.appointment_start,
                       'appointment_end', a.appointment_end
                     ) ORDER BY a.appointment_start)
                     FROM geniusbot.appointments a
                    WHERE a.clinic_id = $1
                      AND a.status IN ('pending', 'confirmed', 'checked_in')
                      AND a.appointment_start < $6
                      AND a.appointment_end > $5
                      AND ($8::uuid IS NULL OR a.id <> $8)
                      AND (
                        a.doctor_id IN (SELECT doctor_id FROM eligible_assignments WHERE doctor_id IS NOT NULL)
                        OR a.room_id IN (SELECT room_id FROM eligible_assignments WHERE room_id IS NOT NULL)
                      )), '[]'::jsonb) AS appointments`,
      [
        clinicId,
        branchId,
        serviceId,
        doctorId,
        windowStart,
        windowEnd,
        timeZone,
        excludeAppointmentId,
        roomId,
      ]
    );
    return { ...result.rows[0], time_zone: timeZone };
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
