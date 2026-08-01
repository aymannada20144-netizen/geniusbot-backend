'use strict';

const BookingResult = require('../../contracts/shaden/BookingResult');

const DEPENDENCY_FIELDS = Object.freeze(['bookingService']);
const COMMAND_FIELDS = Object.freeze([
  'clinicId',
  'conversationId',
  'channel',
  'channelIdentity',
  'service',
  'branch',
  'doctor',
  'availability',
  'patient',
  'appointment',
  'metadata',
]);
const METADATA_FORBIDDEN_FIELDS = new Set([
  'state',
  'replyText',
  'selectionReply',
  'pendingStep',
  'pendingSelection',
  'mutations',
  'transitions',
]);
const UNAVAILABLE_REASONS = new Set([
  'slot_not_available',
  'no_available_assignment',
  'doctor_service_assignment_not_found',
  'service_assignment_not_found',
  'branch_closed',
  'clinic_holiday',
  'outside_branch_working_hours',
  'outside_clinic_holiday_hours',
  'doctor_not_working',
  'outside_doctor_working_hours',
  'doctor_time_off',
  'doctor_conflict',
  'room_inactive',
  'room_branch_mismatch',
  'room_time_off',
  'room_conflict',
]);

class BookingEngine {
  #bookingService;
  #bookAppointment;

  constructor(dependencies) {
    const fields = readFields(
      dependencies,
      DEPENDENCY_FIELDS,
      'BookingEngine dependencies must be a plain object',
      'BookingEngine received unsupported dependency',
      'BookingEngine does not accept accessor dependency:'
    );
    const service = valueOrNull(fields.bookingService);
    const method = findMethod(service, 'bookAppointment');
    if (!method) {
      throw new TypeError(
        'BookingEngine requires bookingService.bookAppointment()'
      );
    }

    this.#bookingService = service;
    this.#bookAppointment = method;
    Object.freeze(this);
  }

  async execute(command) {
    const fields = readFields(
      command,
      COMMAND_FIELDS,
      'BookingEngine command must be a plain object',
      'BookingEngine received unsupported command field',
      'BookingEngine does not accept accessor property: command'
    );
    const values = commandValues(fields);

    const service = readNested(values.service, 'service', ['id']);
    const branch = readNested(values.branch, 'branch', ['id']);
    const doctor = readNested(values.doctor, 'doctor', ['id']);
    const availability = readNested(
      values.availability,
      'availability',
      ['preferredStart']
    );
    const patient = readNested(
      values.patient,
      'patient',
      ['id', 'phoneNumber', 'fullName']
    );
    const appointment = readNested(
      values.appointment,
      'appointment',
      ['paymentMethodId', 'confirmed']
    );
    validatePatientShape(patient);
    validateMetadata(values.metadata);

    const resultFields = {
      service: values.service,
      branch: values.branch,
      doctor: values.doctor,
      availability: values.availability,
      patient: values.patient,
      appointment: values.appointment,
      metadata: values.metadata,
    };

    if (values.clinicId === null) {
      return missingResult(
        'missing_clinic',
        'A clinic identifier is required before a booking can be created.',
        resultFields
      );
    }
    if (!service || service.id === null) {
      return missingResult(
        'missing_service',
        'A service identifier is required before a booking can be created.',
        resultFields
      );
    }
    if (!branch || branch.id === null) {
      return missingResult(
        'missing_branch',
        'A branch identifier is required before a booking can be created.',
        resultFields
      );
    }
    if (!availability || availability.preferredStart === null) {
      return missingResult(
        'missing_availability',
        'A preferred appointment start is required before availability can be checked.',
        resultFields
      );
    }
    if (!hasPatientIdentity(patient)) {
      return missingResult(
        'missing_patient',
        'A patient identifier or complete patient creation data is required before a booking can be created.',
        resultFields
      );
    }
    if (!appointment || appointment.paymentMethodId === null) {
      return missingResult(
        'missing_payment_method',
        'A payment method identifier is required before a booking can be created.',
        resultFields
      );
    }
    if (appointment.confirmed !== true) {
      return missingResult(
        'confirmation_required',
        'Explicit booking confirmation is required before the appointment can be created.',
        resultFields
      );
    }

    const bookingInput = {
      clinic_id: values.clinicId,
      service_id: service.id,
      branch_id: branch.id,
      preferred_start: availability.preferredStart,
      payment_method_id: appointment.paymentMethodId,
      insurance_company_id: values.metadata?.insuranceCompanyId || null,
      insurance_class_id: values.metadata?.insuranceClassId || null,
      confirmed: appointment.confirmed,
    };
    if (doctor && doctor.id !== null) {
      bookingInput.doctor_id = doctor.id;
    }
    if (patient.id !== null) {
      bookingInput.patient_id = patient.id;
    } else {
      bookingInput.phone_number = patient.phoneNumber;
      bookingInput.full_name = patient.fullName;
    }

    const serviceResult = await this.#bookAppointment.call(
      this.#bookingService,
      bookingInput
    );
    return mapServiceResult(serviceResult, values);
  }

  async checkAvailability(command) {
    const fields = readFields(
      command,
      ['clinicId', 'service', 'branch', 'doctor', 'availability'],
      'BookingEngine availability command must be a plain object',
      'BookingEngine received unsupported availability command field',
      'BookingEngine does not accept accessor property: availabilityCommand'
    );
    const clinicId = valueOrNull(fields.clinicId);
    const service = readNested(valueOrNull(fields.service), 'service', ['id']);
    const branch = readNested(valueOrNull(fields.branch), 'branch', ['id']);
    const doctor = readNested(valueOrNull(fields.doctor), 'doctor', ['id']);
    const availability = readNested(
      valueOrNull(fields.availability),
      'availability',
      ['preferredStart']
    );
    if (!clinicId || !service?.id || !branch?.id || !availability?.preferredStart) {
      return new BookingResult({
        type: 'availability_invalid', status: 'rejected',
        service: valueOrNull(fields.service), branch: valueOrNull(fields.branch),
        doctor: valueOrNull(fields.doctor), availability: valueOrNull(fields.availability),
        reason: 'missing_availability_input', warnings: [], references: [],
      });
    }
    const method = findMethod(this.#bookingService, 'checkAvailability');
    if (!method) throw new TypeError('BookingEngine requires bookingService.checkAvailability()');
    const result = await method.call(this.#bookingService, {
      clinic_id: clinicId,
      service_id: service.id,
      branch_id: branch.id,
      doctor_id: doctor?.id || null,
      preferred_start: availability.preferredStart,
    });
    if (result.success === true) {
      return new BookingResult({
        type: 'availability_checked', status: 'available',
        service: valueOrNull(fields.service), branch: valueOrNull(fields.branch),
        doctor: doctorFromAssignment(result.assignment) || valueOrNull(fields.doctor),
        room: roomFromAssignment(result.assignment),
        availability: result.availability || valueOrNull(fields.availability),
        reason: null, warnings: [], references: [],
      });
    }
    return new BookingResult({
      type: 'availability_rejected', status: 'unavailable',
      service: valueOrNull(fields.service), branch: valueOrNull(fields.branch),
      doctor: valueOrNull(fields.doctor), availability: result.availability || valueOrNull(fields.availability),
      reason: result.reason || 'technical_failure', warnings: [], references: [],
      metadata: { reasonCode: result.reason || 'technical_failure' },
    });
  }
}

function readFields(
  input,
  allowlist,
  invalidInputMessage,
  unsupportedPrefix,
  accessorPrefix
) {
  if (!isPlainObject(input)) {
    throw new TypeError(invalidInputMessage);
  }
  const allowed = new Set(allowlist);
  const keys = Object.keys(input);
  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new TypeError(`${unsupportedPrefix}: ${key}`);
    }
  }
  const fields = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor.get || descriptor.set) {
      const separator = accessorPrefix.endsWith(':') ? ' ' : '.';
      throw new TypeError(`${accessorPrefix}${separator}${key}`);
    }
    fields[key] = descriptor;
  }
  return fields;
}

function commandValues(fields) {
  const values = Object.create(null);
  for (const field of COMMAND_FIELDS) {
    values[field] = valueOrNull(fields[field]);
  }
  return values;
}

function readNested(value, name, allowlist) {
  if (value === null) return null;
  const fields = readFields(
    value,
    allowlist,
    `BookingEngine ${name} must be a plain object`,
    `BookingEngine received unsupported ${name} field`,
    `BookingEngine does not accept accessor property: ${name}`
  );
  const values = Object.create(null);
  for (const field of allowlist) {
    values[field] = valueOrNull(fields[field]);
  }
  return values;
}

function validatePatientShape(patient) {
  if (!patient || patient.id === null) return;
  if (patient.phoneNumber !== null || patient.fullName !== null) {
    throw new TypeError(
      'BookingEngine patient.id cannot be combined with patient.phoneNumber or patient.fullName'
    );
  }
}

function validateMetadata(metadata) {
  if (metadata === null) return;
  if (!isPlainObject(metadata)) {
    throw new TypeError('BookingEngine metadata must be a plain object');
  }
  for (const key of Object.keys(metadata)) {
    if (METADATA_FORBIDDEN_FIELDS.has(key)) {
      throw new TypeError(
        `BookingEngine metadata contains forbidden field: ${key}`
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(metadata, key);
    if (descriptor.get || descriptor.set) {
      throw new TypeError(
        `BookingEngine does not accept accessor property: metadata.${key}`
      );
    }
  }
}

function hasPatientIdentity(patient) {
  return patient !== null && (
    patient.id !== null ||
    (patient.phoneNumber !== null && patient.fullName !== null)
  );
}

function missingResult(type, reason, fields) {
  return new BookingResult({
    type,
    status: 'requires_input',
    service: fields.service,
    branch: fields.branch,
    doctor: fields.doctor,
    availability: fields.availability,
    patient: fields.patient,
    appointment: fields.appointment,
    reason,
    warnings: [],
    references: [],
    metadata: fields.metadata,
  });
}

function mapServiceResult(serviceResult, command) {
  const fields = readServiceResult(serviceResult);
  if (fields.success.value !== true) {
    const reasonCode = valueOrNull(fields.reason);
    if (reasonCode === 'unavailable') {
      return new BookingResult({
        type: 'booking_unavailable',
        status: 'unavailable',
        service: command.service,
        branch: command.branch,
        doctor: command.doctor,
        availability: valueOrNull(fields.availability) ??
          command.availability,
        patient: command.patient,
        appointment: command.appointment,
        reason: valueOrNull(fields.message) ?? reasonCode,
        warnings: [],
        references: [],
        metadata: withReasonCode(command.metadata, reasonCode),
      });
    }
    return new BookingResult({
      type: reasonCode === null ? 'booking_rejected' : reasonCode,
      status: UNAVAILABLE_REASONS.has(reasonCode)
        ? 'unavailable'
        : 'rejected',
      service: command.service,
      branch: command.branch,
      doctor: command.doctor,
      availability: valueOrNull(fields.availability) ??
        command.availability,
      patient: command.patient,
      appointment: command.appointment,
      reason:
        'The booking request could not be completed by the current booking service.',
      warnings: [],
      references: [],
      metadata: withReasonCode(command.metadata, reasonCode),
    });
  }

  const createdAppointment = valueOrNull(fields.appointment);
  if (createdAppointment === null) {
    throw new TypeError(
      'BookingEngine bookingService success result must include appointment'
    );
  }
  const resolvedPatient = valueOrNull(fields.patient) ?? command.patient;
  const assignment = valueOrNull(fields.assignment);
  const resolvedDoctor = doctorFromAssignment(assignment) ?? command.doctor;
  const references = appointmentReferences(createdAppointment);

  return new BookingResult({
    type: 'booking_created',
    status: 'completed',
    service: command.service,
    branch: command.branch,
    doctor: resolvedDoctor,
    room: roomFromAppointment(createdAppointment),
    availability: command.availability,
    patient: resolvedPatient,
    appointment: createdAppointment,
    reason: 'The booking was created successfully.',
    warnings: [],
    references,
    metadata: command.metadata,
  });
}

function withReasonCode(metadata, reasonCode) {
  return { ...(metadata || {}), reasonCode: reasonCode || 'technical_failure' };
}

function roomFromAppointment(appointment) {
  if (!isPlainObject(appointment)) return null;
  const number = appointment.room_number ?? null;
  const name = appointment.room_name ?? null;
  if (number === null && name === null) return null;
  return { number, name };
}

function roomFromAssignment(assignment) {
  if (!isPlainObject(assignment)) return null;
  const number = assignment.room_number ?? null;
  const name = assignment.room_name ?? null;
  if (number === null && name === null) return null;
  return { number, name };
}

function readServiceResult(result) {
  if (!isPlainObject(result)) {
    throw new TypeError(
      'BookingEngine bookingService result must be a plain object'
    );
  }
  const fields = Object.create(null);
  for (const field of [
    'success',
    'reason',
    'message',
    'availability',
    'patient',
    'assignment',
    'appointment',
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(result, field);
    if (descriptor?.get || descriptor?.set) {
      throw new TypeError(
        `BookingEngine does not accept accessor property: bookingServiceResult.${field}`
      );
    }
    if (descriptor) fields[field] = descriptor;
  }
  if (!fields.success || typeof fields.success.value !== 'boolean') {
    throw new TypeError(
      'BookingEngine bookingService result.success must be a boolean'
    );
  }
  return fields;
}

function doctorFromAssignment(assignment) {
  if (!isPlainObject(assignment)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(
    assignment,
    'doctor_id'
  );
  if (!descriptor) return null;
  if (descriptor.get || descriptor.set) {
    throw new TypeError(
      'BookingEngine does not accept accessor property: bookingServiceResult.assignment.doctor_id'
    );
  }
  return descriptor.value === undefined || descriptor.value === null
    ? null
    : { id: descriptor.value };
}

function appointmentReferences(appointment) {
  if (!isPlainObject(appointment)) return [];
  const descriptor = Object.getOwnPropertyDescriptor(appointment, 'booking_reference');
  if (!descriptor) return [];
  if (descriptor.get || descriptor.set) {
    throw new TypeError(
      'BookingEngine does not accept accessor property: bookingServiceResult.appointment.booking_reference'
    );
  }
  return descriptor.value === undefined || descriptor.value === null
    ? []
    : [descriptor.value];
}

function findMethod(service, methodName) {
  if ((typeof service !== 'object' || service === null) &&
      typeof service !== 'function') {
    return null;
  }
  let current = service;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, methodName);
    if (descriptor) {
      return !descriptor.get && !descriptor.set &&
        typeof descriptor.value === 'function'
        ? descriptor.value
        : null;
    }
    current = Object.getPrototypeOf(current);
  }
  return null;
}

function valueOrNull(descriptor) {
  return !descriptor || descriptor.value === undefined
    ? null
    : descriptor.value;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

module.exports = BookingEngine;

