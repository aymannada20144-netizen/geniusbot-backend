'use strict';

const ALLOWED_FIELDS = Object.freeze([
  'kind',
  'type',
  'status',
  'service',
  'branch',
  'doctor',
  'room',
  'availability',
  'patient',
  'appointment',
  'reason',
  'warnings',
  'references',
  'metadata',
]);

class BookingResult {
  constructor(input) {
    const fields = readFields(input, 'BookingResult', ALLOWED_FIELDS);

    if (fields.kind && fields.kind.value !== 'booking_result') {
      throw new TypeError(
        'BookingResult requires kind to be booking_result'
      );
    }

    this.kind = 'booking_result';
    this.type = valueOrNull(fields.type);
    this.status = valueOrNull(fields.status);
    this.service = valueOrNull(fields.service);
    this.branch = valueOrNull(fields.branch);
    this.doctor = valueOrNull(fields.doctor);
    this.room = valueOrNull(fields.room);
    this.availability = valueOrNull(fields.availability);
    this.patient = valueOrNull(fields.patient);
    this.appointment = valueOrNull(fields.appointment);
    this.reason = valueOrNull(fields.reason);
    this.warnings = copyArray(fields.warnings, 'BookingResult', 'warnings');
    this.references = copyArray(
      fields.references,
      'BookingResult',
      'references'
    );
    this.metadata = copyMetadata(fields.metadata);

    Object.freeze(this);
  }

  static create(input) {
    return new BookingResult(input);
  }
}

function readFields(input, className, allowedFields) {
  if (!isPlainObject(input)) {
    throw new TypeError(`${className} requires a plain object input`);
  }

  const allowed = new Set(allowedFields);
  const keys = Object.keys(input);

  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new TypeError(`${className} received unsupported field: ${key}`);
    }
  }

  const fields = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor.get || descriptor.set) {
      throw new TypeError(
        `${className} does not accept accessor property: ${key}`
      );
    }
    fields[key] = descriptor;
  }
  return fields;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function valueOrNull(descriptor) {
  return descriptor ? descriptor.value : null;
}

function copyArray(descriptor, className, fieldName) {
  if (!descriptor) return Object.freeze([]);
  if (!Array.isArray(descriptor.value)) {
    throw new TypeError(`${className} requires ${fieldName} to be an Array`);
  }

  const source = descriptor.value;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(source, 'length');
  if (!lengthDescriptor || lengthDescriptor.get || lengthDescriptor.set) {
    throw new TypeError(
      `${className} does not accept accessor property: ${fieldName}.length`
    );
  }

  const copy = new Array(lengthDescriptor.value);
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const item = Object.getOwnPropertyDescriptor(source, String(index));
    if (!item) continue;
    if (item.get || item.set) {
      throw new TypeError(
        `${className} does not accept accessor property: ${fieldName}.${index}`
      );
    }
    Object.defineProperty(copy, String(index), {
      value: item.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return Object.freeze(copy);
}

function copyMetadata(descriptor) {
  if (!descriptor || descriptor.value === undefined ||
      descriptor.value === null) {
    return null;
  }
  if (!isPlainObject(descriptor.value)) {
    throw new TypeError(
      'BookingResult requires metadata to be a plain object or null'
    );
  }

  const source = descriptor.value;
  const copy = Object.getPrototypeOf(source) === null
    ? Object.create(null)
    : {};
  for (const key of Object.keys(source)) {
    const property = Object.getOwnPropertyDescriptor(source, key);
    if (property.get || property.set) {
      throw new TypeError(
        `BookingResult does not accept accessor property: metadata.${key}`
      );
    }
    Object.defineProperty(copy, key, {
      value: property.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return Object.freeze(copy);
}

module.exports = BookingResult;
