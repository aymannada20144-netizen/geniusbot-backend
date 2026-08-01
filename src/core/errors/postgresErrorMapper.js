'use strict';

const { ConflictError } = require('./index');

const POSTGRES_CONSTRAINT_MAP = Object.freeze({
  no_patient_schedule_overlap: {
    ErrorClass: ConflictError,
    message: 'Patient already has another appointment at this time.',
  },
  patients_clinic_id_phone_number_key: {
    ErrorClass: ConflictError,
    message: 'This phone number already belongs to another patient.',
  },
  uq_patients_clinic_normalized_phone: {
    ErrorClass: ConflictError,
    code: 'PATIENT_PHONE_DUPLICATE',
    message: 'A patient with this phone number already exists.',
  },
  clinics_whatsapp_number_key: {
    ErrorClass: ConflictError,
    message: 'This WhatsApp number already belongs to another clinic.',
  },
  uq_branches_clinic_city_name_normalized: {
    ErrorClass: ConflictError,
    code: 'BRANCH_DUPLICATE_IN_CITY',
    message: 'This branch name already exists in the selected city.',
  },
  doctors_clinic_id_full_name_key: {
    ErrorClass: ConflictError,
    message: 'This doctor name already exists.',
  },
  specialties_clinic_id_name_key: {
    ErrorClass: ConflictError,
    message: 'This specialty name already exists.',
  },
  rooms_branch_id_room_number_key: {
    ErrorClass: ConflictError,
    code: 'ROOM_NUMBER_DUPLICATE_IN_BRANCH',
    message: 'This room number already exists in the selected branch.',
  },
  chk_rooms_room_type: {
    ErrorClass: ConflictError,
    code: 'ROOM_TYPE_INVALID',
    message: 'The selected room type is not supported.',
  },
  chk_service_assignment_room_branch: {
    ErrorClass: ConflictError,
    code: 'ROOM_BRANCH_MISMATCH',
    message: 'The selected room does not belong to the assignment branch.',
  },
  chk_service_assignment_room_active: {
    ErrorClass: ConflictError,
    code: 'ROOM_INACTIVE',
    message: 'An inactive room cannot be used in a service assignment.',
  },
  unique_service_assignment_scope: {
    ErrorClass: ConflictError,
    code: 'SERVICE_ASSIGNMENT_DUPLICATE',
    message: 'This service assignment already exists.',
  },
  unique_default_service_assignment: {
    ErrorClass: ConflictError,
    code: 'SERVICE_ASSIGNMENT_DEFAULT_DUPLICATE',
    message: 'This branch and service already have an active default assignment.',
  },
  chk_service_assignment_doctor_required: {
    ErrorClass: ConflictError,
    code: 'SERVICE_ASSIGNMENT_DOCTOR_REQUIRED',
    message: 'The selected service requires a doctor.',
  },
  chk_service_assignment_room_required: {
    ErrorClass: ConflictError,
    code: 'SERVICE_ASSIGNMENT_ROOM_REQUIRED',
    message: 'The selected service requires a room.',
  },
  chk_service_assignment_doctor_working_branch: {
    ErrorClass: ConflictError,
    code: 'SERVICE_ASSIGNMENT_DOCTOR_NOT_WORKING_BRANCH',
    message: 'The selected doctor has no active working hours in this branch.',
  },
  chk_service_assignment_branch_active: {
    ErrorClass: ConflictError,
    code: 'SERVICE_ASSIGNMENT_BRANCH_INACTIVE',
    message: 'Active assignments require an active branch.',
  },
  chk_service_assignment_service_bookable: {
    ErrorClass: ConflictError,
    code: 'SERVICE_ASSIGNMENT_SERVICE_UNAVAILABLE',
    message: 'Active assignments require an active bookable service.',
  },
  chk_service_assignment_doctor_active: {
    ErrorClass: ConflictError,
    code: 'SERVICE_ASSIGNMENT_DOCTOR_INACTIVE',
    message: 'Active assignments cannot use an inactive doctor.',
  },
  chk_appointment_room_branch: {
    ErrorClass: ConflictError,
    code: 'ROOM_BRANCH_MISMATCH',
    message: 'The selected room does not belong to the appointment branch.',
  },
  chk_appointment_room_active: {
    ErrorClass: ConflictError,
    code: 'ROOM_INACTIVE',
    message: 'An inactive room cannot be used in an appointment.',
  },
  services_clinic_id_name_key: {
    ErrorClass: ConflictError,
    message: 'This service name already exists.',
  },
  doctor_specialties_doctor_id_specialty_id_key: {
    ErrorClass: ConflictError,
    message: 'This doctor is already assigned to that specialty.',
  },
  uq_doctor_working_hours_schedule: {
    ErrorClass: ConflictError,
    code: 'DOCTOR_WORKING_HOURS_OVERLAP',
    message: 'Duplicate doctor working periods are not allowed.',
  },
  excl_doctor_working_hours_active_overlap: {
    ErrorClass: ConflictError,
    code: 'DOCTOR_WORKING_HOURS_OVERLAP',
    message: 'Doctor working periods cannot overlap, including across branches.',
  },
  chk_doctor_working_hours_clinic_integrity: {
    ErrorClass: ConflictError,
    code: 'DOCTOR_WORKING_HOURS_CLINIC_MISMATCH',
    message: 'The doctor and branch must belong to the same clinic.',
  },
  chk_doctor_working_hours_doctor_active: {
    ErrorClass: ConflictError,
    code: 'DOCTOR_WORKING_HOURS_DOCTOR_INACTIVE',
    message: 'Active working hours require an active doctor.',
  },
  chk_doctor_working_hours_branch_active: {
    ErrorClass: ConflictError,
    code: 'DOCTOR_WORKING_HOURS_BRANCH_INACTIVE',
    message: 'Active working hours require an active branch.',
  },
  branch_working_hours_branch_id_day_of_week_key: {
    ErrorClass: ConflictError,
    message: 'Working hours already exist for this branch and weekday.',
  },
  payment_methods_clinic_id_code_key: {
    ErrorClass: ConflictError,
    message: 'This payment method code already exists.',
  },
  insurance_companies_clinic_id_name_key: {
    ErrorClass: ConflictError,
    message: 'This insurance company name already exists.',
  },
  insurance_classes_insurance_company_id_class_name_key: {
    ErrorClass: ConflictError,
    message: 'This insurance class name already exists for that company.',
  },
});

const POSTGRES_CHECK_MAP = Object.freeze({
  branch_working_hours_check: 'Closing time must be after opening time, unless the branch is closed.',
  branch_working_hours_day_of_week_check: 'Weekday must be between Sunday and Saturday.',
  clinic_holidays_check: 'Closing time must be after opening time, unless the clinic is closed.',
  doctor_working_hours_check: 'End time must be after start time.',
  doctor_working_hours_day_of_week_check: 'Weekday must be between Sunday and Saturday.',
  chk_doctor_working_hours_time_range: 'End time must be after start time.',
  chk_doctor_working_hours_day: 'Weekday must be between Sunday and Saturday.',
  doctor_time_off_check: 'End date and time must be after start date and time.',
  room_time_off_check: 'End date and time must be after start date and time.',
  services_duration_minutes_check: 'Service duration must be greater than zero.',
  patients_source_check: 'Patient source is invalid.',
});

function mapPostgresError(error) {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const mapping = POSTGRES_CONSTRAINT_MAP[error.constraint];

  if (mapping) {
    const mappedError = new mapping.ErrorClass(mapping.message);
    if (mapping.code) mappedError.code = mapping.code;
    return mappedError;
  }

  if (error.code === '23505') {
    return new ConflictError('A record with the same unique values already exists.');
  }

  if (error.code === '23503') {
    return new ConflictError('This record is referenced by other data or contains an invalid relationship.');
  }

  if (error.code === '23514' || error.code === '23502') {
    const { ValidationError } = require('./index');
    return new ValidationError(
      POSTGRES_CHECK_MAP[error.constraint] ||
      'The submitted values violate a database rule.'
    );
  }

  return null;
}

module.exports = mapPostgresError;
