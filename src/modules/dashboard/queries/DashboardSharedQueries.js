'use strict';

/**
 * Dashboard Shared Queries
 *
 * يحتوي فقط على أجزاء SQL المشتركة.
 * يمنع وضع أي Business Logic داخل هذا الملف.
 */

const dashboardAppointmentBaseSelect = `
  SELECT
    a.id,
    a.clinic_id,
    a.branch_id,
    a.patient_id,
    a.service_id,
    a.doctor_id,
    a.room_id,
    a.appointment_start,
    a.appointment_end,
    a.status,
    a.notes,
    a.created_at,
    a.updated_at,

    p.full_name AS patient_name,
    p.phone_number AS patient_phone,

    s.name AS service_name,
    s.duration_minutes AS service_duration_minutes,
    s.is_active AS service_is_active,

    d.full_name AS doctor_name,

    b.name AS branch_name,

    r.room_name,
    r.room_number
`;

const dashboardAppointmentBaseJoins = `
  FROM geniusbot.appointments a

  LEFT JOIN geniusbot.patients p
    ON p.id = a.patient_id
   AND p.clinic_id = a.clinic_id

  LEFT JOIN geniusbot.services s
    ON s.id = a.service_id
   AND s.clinic_id = a.clinic_id

  LEFT JOIN geniusbot.doctors d
    ON d.id = a.doctor_id
   AND d.clinic_id = a.clinic_id

  LEFT JOIN geniusbot.branches b
    ON b.id = a.branch_id
   AND b.clinic_id = a.clinic_id

  LEFT JOIN geniusbot.rooms r
    ON r.id = a.room_id
   AND r.branch_id = a.branch_id
`;

const dashboardServiceBaseSelect = `
  SELECT
    s.id,
    s.clinic_id,
    s.name,
    s.description,
    s.duration_minutes,
    s.is_active,
    s.created_at,
    s.updated_at
`;

const dashboardServiceBaseFrom = `
  FROM geniusbot.services s
`;

module.exports = {
  dashboardAppointmentBaseSelect,
  dashboardAppointmentBaseJoins,
  dashboardServiceBaseSelect,
  dashboardServiceBaseFrom,
};