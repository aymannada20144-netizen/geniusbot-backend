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
  clinics_whatsapp_number_key: {
    ErrorClass: ConflictError,
    message: 'This WhatsApp number already belongs to another clinic.',
  },
  branches_clinic_id_name_key: {
    ErrorClass: ConflictError,
    message: 'This branch name already exists.',
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
    message: 'This room number already exists in the selected branch.',
  },
  services_clinic_id_name_key: {
    ErrorClass: ConflictError,
    message: 'This service name already exists.',
  },
  doctor_specialties_doctor_id_specialty_id_key: {
    ErrorClass: ConflictError,
    message: 'This doctor is already assigned to that specialty.',
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
    return new mapping.ErrorClass(mapping.message);
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
