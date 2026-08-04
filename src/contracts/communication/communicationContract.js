'use strict';

const COMMUNICATION_EVENT = Object.freeze({
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  REMINDER_24H: 'REMINDER_24H',
  REMINDER_2H: 'REMINDER_2H',
  VISIT_COMPLETED: 'VISIT_COMPLETED',
  REVIEW_REQUEST: 'REVIEW_REQUEST',
  APPOINTMENT_CANCELLED: 'APPOINTMENT_CANCELLED',
  NO_SHOW: 'NO_SHOW',
});

const TEMPLATE_CODE = Object.freeze({
  BOOKING_CONFIRMED: 'booking_confirmed',
  REMINDER_24H: 'reminder_24h',
  REMINDER_2H: 'reminder_2h',
  VISIT_COMPLETED: 'visit_completed',
  REVIEW_REQUEST: 'review_request',
  APPOINTMENT_CANCELLED: 'appointment_cancelled',
  NO_SHOW: 'no_show',
});

const EVENT_TEMPLATE_CODE = Object.freeze({
  [COMMUNICATION_EVENT.BOOKING_CONFIRMED]:
    TEMPLATE_CODE.BOOKING_CONFIRMED,

  [COMMUNICATION_EVENT.REMINDER_24H]:
    TEMPLATE_CODE.REMINDER_24H,

  [COMMUNICATION_EVENT.REMINDER_2H]:
    TEMPLATE_CODE.REMINDER_2H,

  [COMMUNICATION_EVENT.VISIT_COMPLETED]:
    TEMPLATE_CODE.VISIT_COMPLETED,

  [COMMUNICATION_EVENT.REVIEW_REQUEST]:
    TEMPLATE_CODE.REVIEW_REQUEST,

  [COMMUNICATION_EVENT.APPOINTMENT_CANCELLED]:
    TEMPLATE_CODE.APPOINTMENT_CANCELLED,

  [COMMUNICATION_EVENT.NO_SHOW]:
    TEMPLATE_CODE.NO_SHOW,
});

const DELIVERY_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

const COMMUNICATION_CHANNEL = Object.freeze({
  WHATSAPP: 'whatsapp',
});

const TEMPLATE_PLACEHOLDER = Object.freeze({
  PATIENT_NAME: 'patient_name',
  CLINIC_NAME: 'clinic_name',
  BRANCH_NAME: 'branch_name',
  DOCTOR_NAME: 'doctor_name',
  SERVICE_NAME: 'service_name',
  ROOM_NAME: 'room_name',
  APPOINTMENT_DATE: 'appointment_date',
  APPOINTMENT_TIME: 'appointment_time',
  PAYMENT_METHOD: 'payment_method',
  CLINIC_PHONE: 'clinic_phone',
  CLINIC_ADDRESS: 'clinic_address',
  GOOGLE_REVIEW_URL: 'google_review_url',
  BOOKING_REFERENCE: 'booking_reference',
});

const RETRY_POLICY = Object.freeze({
  MAX_ATTEMPTS: 3,
  BACKOFF_MINUTES: Object.freeze([1, 5, 15]),
});

const COMMUNICATION_EVENT_VALUES = Object.freeze(
  Object.values(COMMUNICATION_EVENT)
);

const TEMPLATE_CODE_VALUES = Object.freeze(
  Object.values(TEMPLATE_CODE)
);

const DELIVERY_STATUS_VALUES = Object.freeze(
  Object.values(DELIVERY_STATUS)
);

const COMMUNICATION_CHANNEL_VALUES = Object.freeze(
  Object.values(COMMUNICATION_CHANNEL)
);

const TEMPLATE_PLACEHOLDER_VALUES = Object.freeze(
  Object.values(TEMPLATE_PLACEHOLDER)
);

function isCommunicationEvent(value) {
  return (
    typeof value === 'string' &&
    COMMUNICATION_EVENT_VALUES.includes(value)
  );
}

function isTemplateCode(value) {
  return (
    typeof value === 'string' &&
    TEMPLATE_CODE_VALUES.includes(value)
  );
}

function isDeliveryStatus(value) {
  return (
    typeof value === 'string' &&
    DELIVERY_STATUS_VALUES.includes(value)
  );
}

function isCommunicationChannel(value) {
  return (
    typeof value === 'string' &&
    COMMUNICATION_CHANNEL_VALUES.includes(value)
  );
}

function isTemplatePlaceholder(value) {
  return (
    typeof value === 'string' &&
    TEMPLATE_PLACEHOLDER_VALUES.includes(value)
  );
}

function getTemplateCodeForEvent(eventName) {
  return EVENT_TEMPLATE_CODE[eventName] || null;
}

module.exports = Object.freeze({
  COMMUNICATION_EVENT,
  COMMUNICATION_EVENT_VALUES,

  TEMPLATE_CODE,
  TEMPLATE_CODE_VALUES,
  EVENT_TEMPLATE_CODE,

  DELIVERY_STATUS,
  DELIVERY_STATUS_VALUES,

  COMMUNICATION_CHANNEL,
  COMMUNICATION_CHANNEL_VALUES,

  TEMPLATE_PLACEHOLDER,
  TEMPLATE_PLACEHOLDER_VALUES,

  RETRY_POLICY,

  isCommunicationEvent,
  isTemplateCode,
  isDeliveryStatus,
  isCommunicationChannel,
  isTemplatePlaceholder,
  getTemplateCodeForEvent,
});