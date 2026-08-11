const BaseRepository = require('../../core/BaseRepository');
const { ConflictError, NotFoundError } = require('../../core/errors');
const mapPostgresError = require('../../core/errors/postgresErrorMapper');
const AppointmentEvents = require('./AppointmentEvents');
const {
  deriveChangeTypes,
  semanticSnapshot,
  validateResolvedPatch,
} = require('./AppointmentChange');

class AppointmentRepository extends BaseRepository {
  constructor(db) {
    super(db, 'appointments');
  }

  async createAppointment(data) {
    const created = await this.create({
      clinic_id: data.clinic_id,
      branch_id: data.branch_id,
      patient_id: data.patient_id,
      service_id: data.service_id,
      doctor_id: data.doctor_id || null,
      room_id: data.room_id || null,
      conversation_id: data.conversation_id || null,
      appointment_start: data.appointment_start,
      appointment_end: data.appointment_end,
      payment_method_id: data.payment_method_id || null,
      insurance_company_id: data.insurance_company_id || null,
      insurance_class_id: data.insurance_class_id || null,
      quoted_price: data.quoted_price || null,
      currency: data.currency || 'SAR',
      status: data.status || 'pending',
      source: data.source || 'whatsapp_direct',
      notes: data.notes || null,
    });

    return this.findPresentationById(data.clinic_id, created.id);
  }

  async findPresentationById(clinicId, appointmentId) {
    const sql = `
      SELECT
        a.*,
        p."full_name" AS "patient_name",
        p."phone_number" AS "patient_phone",
        s."name" AS "service_name",
        b."name" AS "branch_name",
        b."google_maps_url" AS "review_url",
        d."full_name" AS "doctor_name",
        r."room_name",
        r."room_number",
        pm."name" AS "payment_method_name",
        pm."code" AS "payment_method_code",
        ic."name" AS "insurance_company_name",
        cls."class_name" AS "insurance_class_name",
        c."name" AS "clinic_name",
        c."timezone" AS "clinic_timezone"
      FROM ${this.fullTableName} a
      JOIN "geniusbot"."clinics" c
        ON c."id" = a."clinic_id"
      JOIN "geniusbot"."patients" p
        ON p."id" = a."patient_id"
       AND p."clinic_id" = a."clinic_id"
      JOIN "geniusbot"."services" s
        ON s."id" = a."service_id"
       AND s."clinic_id" = a."clinic_id"
      JOIN "geniusbot"."branches" b
        ON b."id" = a."branch_id"
       AND b."clinic_id" = a."clinic_id"
      LEFT JOIN "geniusbot"."doctors" d
        ON d."id" = a."doctor_id"
       AND d."clinic_id" = a."clinic_id"
      LEFT JOIN "geniusbot"."rooms" r
       ON r."id" = a."room_id"
       AND r."branch_id" = a."branch_id"
      LEFT JOIN "geniusbot"."payment_methods" pm
        ON pm."id" = a."payment_method_id"
       AND pm."clinic_id" = a."clinic_id"
      LEFT JOIN "geniusbot"."insurance_companies" ic
        ON ic."id" = a."insurance_company_id"
       AND ic."clinic_id" = a."clinic_id"
      LEFT JOIN "geniusbot"."insurance_classes" cls
        ON cls."id" = a."insurance_class_id"
       AND cls."insurance_company_id" = a."insurance_company_id"
      WHERE a."clinic_id" = $1
        AND a."id" = $2
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, appointmentId]);
    return result.rows[0] || null;
  }

  async findByClinicId(clinicId) {
    const sql = `
      SELECT
        a."id",
        p."full_name" AS "patient_name",
        p."phone_number",
        s."name" AS "service_name",
        d."full_name" AS "doctor_name",
        r."room_name" AS "room_name",
        a."appointment_start",
        a."appointment_end",
        pm."name" AS "payment_method",
        a."status"
      FROM ${this.fullTableName} a
      JOIN "geniusbot"."patients" p
        ON p."id" = a."patient_id"
       AND p."clinic_id" = a."clinic_id"
      JOIN "geniusbot"."services" s
        ON s."id" = a."service_id"
       AND s."clinic_id" = a."clinic_id"
      LEFT JOIN "geniusbot"."doctors" d
        ON d."id" = a."doctor_id"
       AND d."clinic_id" = a."clinic_id"
      LEFT JOIN "geniusbot"."rooms" r
        ON r."id" = a."room_id"
      LEFT JOIN "geniusbot"."payment_methods" pm
        ON pm."id" = a."payment_method_id"
       AND pm."clinic_id" = a."clinic_id"
      WHERE a."clinic_id" = $1
      ORDER BY a."appointment_start" ASC
    `;

    const result = await this.query(sql, [clinicId]);
    return result.rows;
  }

  async findUpcomingByPatient(clinicId, patientId) {
    const sql = `
      SELECT
        a."id",
        a."clinic_id",
        a."branch_id",
        a."patient_id",
        a."service_id",
        a."doctor_id",
        a."room_id",
        a."appointment_start",
        a."appointment_end",
        a."status",
        a."notes",
        s."name" AS "service_name",
        d."full_name" AS "doctor_name",
        b."name" AS "branch_name",
        r."room_name",
        r."room_number"
      FROM ${this.fullTableName} a
      LEFT JOIN "geniusbot"."services" s
        ON s."id" = a."service_id"
      LEFT JOIN "geniusbot"."doctors" d
        ON d."id" = a."doctor_id"
      LEFT JOIN "geniusbot"."branches" b
        ON b."id" = a."branch_id"
      LEFT JOIN "geniusbot"."rooms" r
        ON r."id" = a."room_id"
      WHERE a."clinic_id" = $1
        AND a."patient_id" = $2
        AND a."appointment_start" >= NOW()
        AND a."status" IN ('pending', 'confirmed', 'checked_in')
      ORDER BY a."appointment_start" ASC
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, patientId]);
    return result.rows[0] || null;
  }

  async findAppointmentHistoryByPatient(clinicId, patientId) {
    const sql = `
      SELECT
        a."id",
        a."clinic_id",
        a."branch_id",
        a."patient_id",
        a."service_id",
        a."doctor_id",
        a."room_id",
        a."appointment_start",
        a."appointment_end",
        a."status",
        a."notes",
        s."name" AS "service_name",
        d."full_name" AS "doctor_name",
        b."name" AS "branch_name",
        r."room_name",
        r."room_number"
      FROM ${this.fullTableName} a
      LEFT JOIN "geniusbot"."services" s
        ON s."id" = a."service_id"
      LEFT JOIN "geniusbot"."doctors" d
        ON d."id" = a."doctor_id"
      LEFT JOIN "geniusbot"."branches" b
        ON b."id" = a."branch_id"
      LEFT JOIN "geniusbot"."rooms" r
        ON r."id" = a."room_id"
      WHERE a."clinic_id" = $1
        AND a."patient_id" = $2
      ORDER BY a."appointment_start" DESC
    `;

    const result = await this.query(sql, [clinicId, patientId]);
    return result.rows;
  }

  async hasDoctorConflict(
    doctorId,
    startTime,
    endTime,
    excludeAppointmentId = null
  ) {
    if (!doctorId) return false;

    let sql = `
      SELECT "id"
      FROM ${this.fullTableName}
      WHERE "doctor_id" = $1
        AND "status" IN ('pending', 'confirmed', 'checked_in')
        AND "appointment_start" < $3
        AND "appointment_end" > $2
    `;

    const values = [doctorId, startTime, endTime];

    if (excludeAppointmentId) {
      sql += `
        AND "id" <> $4
      `;
      values.push(excludeAppointmentId);
    }

    sql += `
      LIMIT 1
    `;

    const result = await this.query(sql, values);
    return result.rows.length > 0;
  }

  async hasRoomConflict(
    roomId,
    startTime,
    endTime,
    excludeAppointmentId = null
  ) {
    if (!roomId) return false;

    let sql = `
      SELECT "id"
      FROM ${this.fullTableName}
      WHERE "room_id" = $1
        AND "status" IN ('pending', 'confirmed', 'checked_in')
        AND "appointment_start" < $3
        AND "appointment_end" > $2
    `;

    const values = [roomId, startTime, endTime];

    if (excludeAppointmentId) {
      sql += `
        AND "id" <> $4
      `;
      values.push(excludeAppointmentId);
    }

    sql += `
      LIMIT 1
    `;

    const result = await this.query(sql, values);
    return result.rows.length > 0;
  }

  // Appointment status changes must go through
  // AppointmentService.updateAppointmentStatus() so lifecycle validation and
  // post-confirmation communication always execute from one central path.
  async updateStatus(
    clinicId,
    appointmentId,
    status,
    expectedStatus = null,
    cancellationReason = null,
    applyCancellationNotes = false,
    actorId = null,
    statusChangeNotes = null
  ) {
    const sql = `
      WITH audit_context AS MATERIALIZED (
        SELECT
          pg_catalog.set_config(
            'geniusbot.changed_by_staff_id',
            COALESCE($7::text, ''),
            true
          ),
          pg_catalog.set_config(
            'geniusbot.status_change_notes',
            COALESCE($8::text, ''),
            true
          )
      ),
      updated AS MATERIALIZED (
        UPDATE ${this.fullTableName}
        SET
          "status" = $3,
          "notes" = CASE
            WHEN $3 = 'cancelled' AND $6::boolean THEN $5
            ELSE "notes"
          END,
          "updated_at" = NOW()
        WHERE "clinic_id" = $1
          AND "id" = $2
          AND ($4::text IS NULL OR "status" = $4)
          AND EXISTS (SELECT 1 FROM audit_context)
        RETURNING "id", "status"
      ),
      outbox_event AS (
        INSERT INTO geniusbot.outbox_events (
          event_name,
          aggregate_type,
          aggregate_id,
          payload
        )
        SELECT
          '${AppointmentEvents.STATUS_CHANGED}',
          'appointment',
          "id",
          jsonb_build_object(
            'appointmentId', "id"::text,
            'fromStatus', $4,
            'toStatus', "status"
          )
        FROM updated
        RETURNING "id"
      )
      SELECT updated."id", updated."status"
      FROM updated
      JOIN outbox_event ON true
    `;

    const result = await this.query(sql, [
      clinicId,
      appointmentId,
      status,
      expectedStatus,
      cancellationReason,
      applyCancellationNotes,
      actorId,
      statusChangeNotes,
    ]);

    return result.rows[0] || null;
  }

  async updateAppointmentSchedule(clinicId, appointmentId, data) {
    return this.updateByIdAndClinic(clinicId, appointmentId, {
      appointment_start: data.appointment_start,
      appointment_end: data.appointment_end,
    });
  }

  async applyAtomicChange({
    clinicId,
    appointmentId,
    expectedStatus = null,
    expectedUpdatedAt = null,
    operation,
    patch,
    actor,
    reason = null,
  }) {
    if (!this.db || typeof this.db.transaction !== 'function') {
      throw new TypeError(
        'AppointmentRepository.applyAtomicChange requires db.transaction().'
      );
    }

    const validatedPatch = validateResolvedPatch(patch);

    try {
      return await this.db.transaction(async (client) => {
        const lockedResult = await client.query(
          `SELECT *
             FROM ${this.fullTableName}
            WHERE "id" = $1
            FOR UPDATE`,
          [appointmentId]
        );
        const beforeAppointment = lockedResult.rows[0];

        if (!beforeAppointment) {
          const error = new NotFoundError('Appointment not found.');
          error.code = 'APPOINTMENT_NOT_FOUND';
          throw error;
        }
        if (beforeAppointment.clinic_id !== clinicId) {
          const error = new NotFoundError(
            'Appointment was not found in the requested clinic.'
          );
          error.code = 'APPOINTMENT_CLINIC_SCOPE_VIOLATION';
          throw error;
        }

        const actualUpdatedAt = new Date(beforeAppointment.updated_at).toISOString();
        if (
          (expectedStatus != null && beforeAppointment.status !== expectedStatus) ||
          (expectedUpdatedAt != null && actualUpdatedAt !== expectedUpdatedAt)
        ) {
          const error = new ConflictError(
            'The appointment changed after it was reviewed.'
          );
          error.code = 'APPOINTMENT_STALE';
          throw error;
        }

        if (Object.prototype.hasOwnProperty.call(validatedPatch, 'status')) {
          await client.query(
            `SELECT
               pg_catalog.set_config(
                 'geniusbot.changed_by_staff_id', $1, true
               ),
               pg_catalog.set_config(
                 'geniusbot.status_change_notes', $2, true
               )`,
            [actor.staffId || '', reason || '']
          );
        }

        const fields = Object.keys(validatedPatch);
        const values = Object.values(validatedPatch);
        const setClause = fields
          .map((field, index) => `${this.quoteIdentifier(field)} = $${index + 1}`)
          .join(', ');
        const updatedResult = await client.query(
          `UPDATE ${this.fullTableName}
              SET ${setClause}, "updated_at" = NOW()
            WHERE "id" = $${fields.length + 1}
              AND "clinic_id" = $${fields.length + 2}
          RETURNING *`,
          [...values, appointmentId, clinicId]
        );
        const afterAppointment = updatedResult.rows[0];
        const before = semanticSnapshot(beforeAppointment);
        const after = semanticSnapshot(afterAppointment);
        const changeTypes = deriveChangeTypes(before, after);

        if (changeTypes.length === 0) {
          const error = new ConflictError(
            'The requested appointment change has no effect.'
          );
          error.code = 'APPOINTMENT_CHANGE_EMPTY';
          throw error;
        }

        const actorType = actor.staffId
          ? 'staff'
          : actor.patientId
            ? 'patient'
            : 'system';
        const actorId = actor.staffId || actor.patientId || null;
        const auditResult = await client.query(
          `INSERT INTO geniusbot.appointment_change_logs (
             appointment_id, clinic_id, operation, change_types,
             before_state, after_state, changed_by_staff_id,
             actor_type, actor_id, source, reason
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id, created_at`,
          [
            appointmentId, clinicId, operation, changeTypes, before, after,
            actor.staffId || null, actorType, actorId, actor.source, reason,
          ]
        );
        const audit = auditResult.rows[0];
        const changedFields = Object.keys(after).filter(
          (field) => before[field] !== after[field]
        );
        const eventBefore = Object.fromEntries(
          changedFields.map((field) => [field, before[field]])
        );
        const eventAfter = Object.fromEntries(
          changedFields.map((field) => [field, after[field]])
        );
        const eventPayload = {
          clinicId,
          appointmentId,
          operation,
          changeTypes,
          before: eventBefore,
          after: eventAfter,
          actor: { type: actorType, id: actorId, source: actor.source },
          ...(reason ? { reason } : {}),
        };

        if (changeTypes.includes('status')) {
          await client.query(
            `INSERT INTO geniusbot.outbox_events (
               event_name, aggregate_type, aggregate_id, payload
             ) VALUES ($1, 'appointment', $2, $3)`,
            [
              AppointmentEvents.STATUS_CHANGED,
              appointmentId,
              {
                appointmentId,
                fromStatus: before.status,
                toStatus: after.status,
              },
            ]
          );
        }

        await client.query(
          `INSERT INTO geniusbot.outbox_events (
             event_name, aggregate_type, aggregate_id, payload
           ) VALUES ($1, 'appointment', $2, $3)`,
          [AppointmentEvents.CHANGED, appointmentId, eventPayload]
        );

        return { appointment: afterAppointment, audit, event: eventPayload };
      });
    } catch (error) {
      const mapped = mapPostgresError(error);
      if (mapped) throw mapped;
      throw error;
    }
  }
}

module.exports = AppointmentRepository;
