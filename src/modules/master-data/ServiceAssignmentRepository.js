'use strict';

class ServiceAssignmentRepository {
  constructor(db) {
    this.db = db;
  }

  async list(clinicId) {
    const result = await this.db.query(
      `SELECT sa.*, b.name AS branch_name, b.city AS branch_city, s.name AS service_name,
              s.requires_doctor, s.requires_room,
              d.full_name AS doctor_name,
              r.room_number, r.room_name
         FROM geniusbot.service_assignments sa
         JOIN geniusbot.branches b ON b.id = sa.branch_id
         JOIN geniusbot.services s ON s.id = sa.service_id
         LEFT JOIN geniusbot.doctors d ON d.id = sa.doctor_id
         LEFT JOIN geniusbot.rooms r ON r.id = sa.room_id
        WHERE sa.clinic_id = $1
        ORDER BY b.name, s.name, sa.is_default DESC, sa.created_at, sa.id`,
      [clinicId],
    );
    return result.rows;
  }

  async options(clinicId, branchId = null) {
    const [branches, services, rooms, doctors] = await Promise.all([
      this.db.query(
        `SELECT id, name, city FROM geniusbot.branches
          WHERE clinic_id = $1 AND is_active ORDER BY city, name`,
        [clinicId],
      ),
      this.db.query(
        `SELECT id, name, requires_doctor, requires_room
           FROM geniusbot.services
          WHERE clinic_id = $1 AND is_active AND is_booking_enabled
          ORDER BY display_order, name`,
        [clinicId],
      ),
      branchId
        ? this.db.query(
            `SELECT r.id, r.room_number, r.room_name
               FROM geniusbot.rooms r
               JOIN geniusbot.branches b ON b.id = r.branch_id
              WHERE b.clinic_id = $1 AND r.branch_id = $2
                AND b.is_active AND r.is_active
              ORDER BY r.room_number, r.room_name`,
            [clinicId, branchId],
          )
        : { rows: [] },
      branchId
        ? this.db.query(
            `SELECT DISTINCT d.id, d.full_name
               FROM geniusbot.doctors d
               JOIN geniusbot.doctor_working_hours dwh
                 ON dwh.doctor_id = d.id
                AND dwh.branch_id = $2
                AND dwh.is_active
               JOIN geniusbot.branches b ON b.id = dwh.branch_id
              WHERE d.clinic_id = $1 AND b.clinic_id = $1
                AND d.is_active AND b.is_active
              ORDER BY d.full_name`,
            [clinicId, branchId],
          )
        : { rows: [] },
    ]);
    return {
      branches: branches.rows,
      services: services.rows,
      rooms: rooms.rows,
      doctors: doctors.rows,
    };
  }

  transaction(callback) {
    return this.db.transaction(callback);
  }

  async lockResources(client, clinicId, data) {
    const service = await client.query(
      `SELECT id, clinic_id, is_active, is_booking_enabled,
              requires_doctor, requires_room
         FROM geniusbot.services
        WHERE id = $2 AND clinic_id = $1
        FOR UPDATE`,
      [clinicId, data.service_id],
    );
    const branch = await client.query(
      `SELECT id, clinic_id, is_active FROM geniusbot.branches
        WHERE id = $2 AND clinic_id = $1 FOR UPDATE`,
      [clinicId, data.branch_id],
    );
    if (data.doctor_id) {
      await client.query(
        `SELECT id FROM geniusbot.doctors
          WHERE id = $2 AND clinic_id = $1 FOR UPDATE`,
        [clinicId, data.doctor_id],
      );
    }
    if (data.room_id) {
      await client.query(
        `SELECT r.id FROM geniusbot.rooms r
          JOIN geniusbot.branches b ON b.id = r.branch_id
         WHERE r.id = $2 AND b.clinic_id = $1 FOR UPDATE OF r`,
        [clinicId, data.room_id],
      );
    }
    return {
      service: service.rows[0] || null,
      branch: branch.rows[0] || null,
    };
  }

  async findForUpdate(client, clinicId, id) {
    const result = await client.query(
      `SELECT * FROM geniusbot.service_assignments
        WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
      [clinicId, id],
    );
    return result.rows[0] || null;
  }

  async create(client, clinicId, data) {
    const result = await client.query(
      `INSERT INTO geniusbot.service_assignments
        (clinic_id, branch_id, service_id, doctor_id, room_id, is_default, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        clinicId, data.branch_id, data.service_id, data.doctor_id,
        data.room_id, data.is_default, data.is_active,
      ],
    );
    return result.rows[0];
  }

  async update(client, clinicId, id, data) {
    const result = await client.query(
      `UPDATE geniusbot.service_assignments
          SET branch_id = $3, service_id = $4, doctor_id = $5,
              room_id = $6, is_default = $7, is_active = $8,
              updated_at = NOW()
        WHERE clinic_id = $1 AND id = $2
        RETURNING *`,
      [
        clinicId, id, data.branch_id, data.service_id, data.doctor_id,
        data.room_id, data.is_default, data.is_active,
      ],
    );
    return result.rows[0] || null;
  }

  async hasMatchingAppointment(client, clinicId, assignment) {
    const result = await client.query(
      `SELECT 1 FROM geniusbot.appointments
        WHERE clinic_id = $1
          AND branch_id = $2
          AND service_id = $3
          AND doctor_id IS NOT DISTINCT FROM $4
          AND room_id IS NOT DISTINCT FROM $5
        LIMIT 1`,
      [
        clinicId, assignment.branch_id, assignment.service_id,
        assignment.doctor_id, assignment.room_id,
      ],
    );
    return result.rowCount > 0;
  }

  async remove(client, clinicId, id) {
    const result = await client.query(
      `DELETE FROM geniusbot.service_assignments
        WHERE clinic_id = $1 AND id = $2 RETURNING *`,
      [clinicId, id],
    );
    return result.rows[0] || null;
  }
}

module.exports = ServiceAssignmentRepository;
