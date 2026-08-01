const BaseRepository = require('../../core/BaseRepository');
const {
  normalizeSaudiMobile,
  normalizeSaudiMobileDigits,
} = require('../../core/validators/saudiMobile');
const PatientIdentityConflictError = require(
  '../../core/errors/PatientIdentityConflictError'
);

const NORMALIZED_PHONE_SQL = (column = 'phone_number') => `
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

class PatientRepository extends BaseRepository {
  constructor(db) {
    super(db, 'patients');
  }

  async findByClinicAndId(clinicId, patientId) {
    const sql = `
      SELECT *
      FROM geniusbot.patients
      WHERE clinic_id = $1
        AND id = $2
      LIMIT 1
    `;

    const result = await this.query(sql, [
      clinicId,
      patientId,
    ]);

    return result.rows[0] || null;
  }
async findById(clinicId, patientId) {
  return this.findByClinicAndId(
    clinicId,
    patientId
  );
}
  async findByClinicAndPhone(clinicId, phoneNumber) {
    const matches = await this.findAllByClinicAndPhone(clinicId, phoneNumber);
    if (matches.length > 1) {
      throw new PatientIdentityConflictError();
    }
    return matches[0] || null;
  }

  async findAllByClinicAndPhone(clinicId, phoneNumber, queryable = this) {
    const normalizedPhone = normalizeSaudiMobileDigits(
      phoneNumber,
      'phoneNumber'
    );
    const sql = `
      SELECT *
      FROM geniusbot.patients
      WHERE clinic_id = $1
        AND (${NORMALIZED_PHONE_SQL('phone_number')}) = $2
      ORDER BY created_at ASC, id ASC
    `;

    const result = await queryable.query(sql, [
      clinicId,
      normalizedPhone,
    ]);

    return result.rows;
  }

  async createPatient(data) {
    const phoneNumber = normalizeSaudiMobile(
      data.phone_number,
      'phone_number'
    );
    const whatsappId = data.whatsapp_id
      ? normalizeSaudiMobile(data.whatsapp_id, 'whatsapp_id')
      : null;
    const result = await this.query(`
      INSERT INTO geniusbot.patients (
        clinic_id, full_name, phone_number, whatsapp_id,
        email, gender, birth_date, source, notes, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      data.clinic_id,
      data.full_name,
      phoneNumber,
      whatsappId,
      data.email,
      data.gender,
      data.birth_date,
      data.source,
      data.notes,
      data.is_active,
    ]);
    return result.rows[0];
  }

  async updatePatient(clinicId, patientId, data) {
    const normalizedData = { ...data };
    if (Object.hasOwn(normalizedData, 'phone_number')) {
      normalizedData.phone_number = normalizeSaudiMobile(
        normalizedData.phone_number,
        'phone_number'
      );
    }
    if (Object.hasOwn(normalizedData, 'whatsapp_id')) {
      normalizedData.whatsapp_id = normalizeSaudiMobile(
        normalizedData.whatsapp_id,
        'whatsapp_id',
        true
      );
    }
    const fields = Object.keys(normalizedData);
    if (fields.length === 0) {
      return this.findByClinicAndId(clinicId, patientId);
    }
    const values = fields.map((field) => normalizedData[field]);
    const assignments = fields.map(
      (field, index) => `${field} = $${index + 1}`
    );
    values.push(clinicId, patientId);
    const result = await this.query(`
      UPDATE geniusbot.patients
      SET ${assignments.join(', ')}, updated_at = NOW()
      WHERE clinic_id = $${values.length - 1}
        AND id = $${values.length}
      RETURNING *
    `, values);
    return result.rows[0] || null;
  }

  async setActiveStatus(clinicId, patientId, isActive) {
    const result = await this.query(`
      UPDATE geniusbot.patients
      SET is_active = $3, updated_at = NOW()
      WHERE clinic_id = $1 AND id = $2
      RETURNING *
    `, [clinicId, patientId, isActive]);
    return result.rows[0] || null;
  }

  async deleteSafely(clinicId, patientId) {
    return this.db.transaction(async (client) => {
      const patientResult = await client.query(`
        SELECT * FROM geniusbot.patients
        WHERE clinic_id = $1 AND id = $2
        FOR UPDATE
      `, [clinicId, patientId]);
      const patient = patientResult.rows[0] || null;
      if (!patient) return { patient: null, blockers: [] };

      const result = await client.query(`
        SELECT
          EXISTS (SELECT 1 FROM geniusbot.appointments WHERE patient_id = $1) AS appointments,
          EXISTS (SELECT 1 FROM geniusbot.conversations WHERE patient_id = $1) AS conversations,
          EXISTS (SELECT 1 FROM geniusbot.transactions WHERE patient_id = $1) AS financial_records,
          EXISTS (SELECT 1 FROM geniusbot.patient_pre_answers WHERE patient_id = $1) AS clinical_records,
          EXISTS (SELECT 1 FROM geniusbot.booking_abandonments WHERE patient_id = $1)
            OR EXISTS (SELECT 1 FROM geniusbot.waitlist WHERE patient_id = $1)
            OR EXISTS (SELECT 1 FROM geniusbot.missed_calls WHERE patient_id = $1)
            OR EXISTS (SELECT 1 FROM geniusbot.notification_logs WHERE patient_id = $1)
            OR EXISTS (SELECT 1 FROM geniusbot.patient_activity_logs WHERE patient_id = $1)
            OR EXISTS (SELECT 1 FROM geniusbot.reactivation_targets WHERE patient_id = $1)
            OR EXISTS (SELECT 1 FROM geniusbot.recovery_attempts WHERE patient_id = $1)
            OR EXISTS (SELECT 1 FROM geniusbot.revenue_conversions WHERE patient_id = $1)
            OR EXISTS (SELECT 1 FROM geniusbot.revenue_opportunities WHERE patient_id = $1)
            OR EXISTS (SELECT 1 FROM geniusbot.opportunity_events WHERE patient_id = $1)
            AS operational_records
      `, [patientId]);
      const blockers = Object.entries(result.rows[0])
        .filter(([, blocked]) => blocked)
        .map(([name]) => name);
      if (blockers.length) return { patient, blockers };

      const deleted = await client.query(`
        DELETE FROM geniusbot.patients
        WHERE clinic_id = $1 AND id = $2
        RETURNING *
      `, [clinicId, patientId]);
      return { patient: deleted.rows[0] || null, blockers: [] };
    });
  }

  async findByClinicAndWhatsApp(clinicId, whatsappId) {
    return this.findByClinicAndChannelIdentity(clinicId, whatsappId);
  }

  async findByClinicAndChannelIdentity(clinicId, channelIdentity) {
    const normalizedIdentity = normalizeSaudiMobileDigits(
      channelIdentity,
      'channelIdentity'
    );
    const result = await this.query(`
      SELECT *
      FROM geniusbot.patients
      WHERE clinic_id = $1
        AND is_active = true
        AND (
          (${NORMALIZED_PHONE_SQL('whatsapp_id')}) = $2
          OR (${NORMALIZED_PHONE_SQL('phone_number')}) = $2
        )
      ORDER BY created_at ASC, id ASC
    `, [clinicId, normalizedIdentity]);
    const matches = result.rows.filter((row, index, rows) =>
      rows.findIndex((candidate) => candidate.id === row.id) === index
    );
    if (matches.length > 1) throw new PatientIdentityConflictError();
    return matches[0] || null;
  }

  async getAppointments(clinicId, patientId) {
    const result = await this.query(`
      SELECT
        a.id,
        a.appointment_start,
        a.appointment_end,
        a.status,
        s.name AS service_name,
        d.full_name AS doctor_name,
        b.name AS branch_name
      FROM geniusbot.appointments a
      LEFT JOIN geniusbot.services s ON s.id = a.service_id
      LEFT JOIN geniusbot.doctors d ON d.id = a.doctor_id
      LEFT JOIN geniusbot.branches b ON b.id = a.branch_id
      WHERE a.clinic_id = $1
        AND a.patient_id = $2
      ORDER BY a.appointment_start DESC
      LIMIT 100
    `, [clinicId, patientId]);
    return result.rows;
  }

  async findOrCreateByClinicAndPhone(data) {
    const normalizedPhone = normalizeSaudiMobile(
      data.phone_number,
      'phone_number'
    );
    let patient = await this.findByClinicAndPhone(
      data.clinic_id,
      normalizedPhone
    );

    if (patient) {
      return patient;
    }

    patient = await this.createPatient({
      clinic_id: data.clinic_id,
      full_name: data.full_name,
      phone_number: normalizedPhone,
      whatsapp_id: data.whatsapp_id,
      source: data.source,
      notes: data.notes,
      first_seen_at: new Date(),
      last_seen_at: new Date(),
      is_active: true,
      email: null,
      gender: null,
      birth_date: null,
    });

    return patient;
  }

  async completeIdentity({
    clinicId,
    conversationId,
    currentPatientId,
    whatsappPhone,
    fullName,
    phoneNumber,
  }) {
    const normalizedWhatsapp = normalizeSaudiMobile(
      whatsappPhone,
      'whatsappPhone'
    );
    const normalizedPhone = normalizeSaudiMobile(
      phoneNumber,
      'phoneNumber'
    );
    if (normalizedPhone !== normalizedWhatsapp) {
      throw new PatientIdentityConflictError(
        'The supplied customer phone does not match the WhatsApp identity.'
      );
    }
    if (typeof this.db.transaction !== 'function') {
      throw new TypeError(
        'Patient identity completion requires db.transaction().'
      );
    }

    return this.db.transaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [clinicId, normalizeSaudiMobileDigits(normalizedPhone)]
      );
      const matches = await this.findAllByClinicAndPhone(
        clinicId,
        normalizedPhone,
        client
      );
      if (matches.length > 1) {
        throw new PatientIdentityConflictError();
      }
      const matched = matches[0] || null;
      if (
        matched &&
        currentPatientId &&
        matched.id !== currentPatientId
      ) {
        throw new PatientIdentityConflictError(
          'The normalized phone belongs to another patient.'
        );
      }

      let patient;
      if (currentPatientId) {
        const update = await client.query(`
          UPDATE geniusbot.patients
          SET full_name = $3,
              phone_number = $4,
              whatsapp_id = $4,
              is_active = TRUE,
              updated_at = NOW(),
              last_seen_at = NOW()
          WHERE clinic_id = $1
            AND id = $2
          RETURNING *
        `, [clinicId, currentPatientId, fullName.trim(), normalizedPhone]);
        patient = update.rows[0] || null;
      } else if (matched) {
        patient = matched;
      } else {
        const insert = await client.query(`
          INSERT INTO geniusbot.patients (
            clinic_id, full_name, phone_number, whatsapp_id,
            source, is_active, first_seen_at, last_seen_at
          )
          VALUES ($1, $2, $3, $3, 'whatsapp_direct', TRUE, NOW(), NOW())
          RETURNING *
        `, [clinicId, fullName.trim(), normalizedPhone]);
        patient = insert.rows[0];
      }
      if (!patient) {
        throw new Error('Patient identity could not be persisted.');
      }
      await client.query(`
        UPDATE geniusbot.conversations
        SET patient_id = $3
        WHERE clinic_id = $1
          AND id = $2
      `, [clinicId, conversationId, patient.id]);
      return patient;
    });
  }

  async searchPatients(
    clinicId,
    {
      search = '',
      limit = 50,
      offset = 0,
    } = {}
  ) {
    const sql = `
      SELECT p.id, p.full_name, p.phone_number, p.email, p.is_active,
        p.updated_at, p.created_at,
        COUNT(a.id)::int AS total_appointments,
        MAX(a.appointment_start) AS latest_appointment_date,
        (ARRAY_AGG(a.status ORDER BY a.appointment_start DESC)
          FILTER (WHERE a.id IS NOT NULL))[1] AS latest_appointment_status,
        BOOL_OR(a.appointment_start >= NOW() AND a.status IN ('pending', 'confirmed'))
          AS has_upcoming_appointment,
        c.id AS conversation_id, c.bot_enabled
      FROM geniusbot.patients p
      LEFT JOIN geniusbot.appointments a
        ON a.patient_id = p.id AND a.clinic_id = p.clinic_id
      LEFT JOIN LATERAL (
        SELECT id, bot_enabled FROM geniusbot.conversations
        WHERE clinic_id = p.clinic_id AND patient_id = p.id AND status = 'open'
        ORDER BY started_at DESC LIMIT 1
      ) c ON true
      WHERE p.clinic_id = $1
        AND (
          p.full_name ILIKE $2 OR p.phone_number ILIKE $2
        )
      GROUP BY p.id, c.id, c.bot_enabled
      ORDER BY p.created_at DESC
      LIMIT $3
      OFFSET $4
    `;

    const result = await this.query(sql, [
      clinicId,
      `%${search}%`,
      limit,
      offset,
    ]);

    return result.rows;
  }

  async updateLastSeen(clinicId, patientId) {
    const sql = `
      UPDATE geniusbot.patients
      SET
        last_seen_at = NOW(),
        updated_at = NOW()
      WHERE clinic_id = $1
        AND id = $2
      RETURNING *
    `;

    const result = await this.query(sql, [
      clinicId,
      patientId,
    ]);

    return result.rows[0] || null;
  }

  async deactivate(clinicId, patientId) {
    const sql = `
      UPDATE geniusbot.patients
      SET
        is_active = false,
        updated_at = NOW()
      WHERE clinic_id = $1
        AND id = $2
      RETURNING *
    `;

    const result = await this.query(sql, [
      clinicId,
      patientId,
    ]);

    return result.rows[0] || null;
  }

  async reactivate(clinicId, patientId) {
    const sql = `
      UPDATE geniusbot.patients
      SET
        is_active = true,
        updated_at = NOW()
      WHERE clinic_id = $1
        AND id = $2
      RETURNING *
    `;

    const result = await this.query(sql, [
      clinicId,
      patientId,
    ]);

    return result.rows[0] || null;
  }
}

module.exports = PatientRepository;
