'use strict';

const { normalizeArabic } = require('./ShadenArabicNormalizer');

const REQUEST_PREFIX = '(?:(?:اريد|ريد|ابي|ابغي|ابغى|ابغا|ودي|ممكن|هل يمكنني)\\s+)?';
const APPOINTMENT_OBJECT = '(?:الحجز|حجز|حجزي|الموعد|موعد|موعدي)';
const EXPLICIT_CANCELLATION_ACTION = '(?:الغاء|الغي|الغئ|الغيه)';
const CANCELLATION_PATTERN = new RegExp(
  `^(?:${REQUEST_PREFIX}${EXPLICIT_CANCELLATION_ACTION}$|${REQUEST_PREFIX}(?:${EXPLICIT_CANCELLATION_ACTION}|حذف|احذف|اعتذر عن|افك|فكي|شيلي|شيل)\\s*${APPOINTMENT_OBJECT}|(?:كنسل|كانسل|الغا|الالغاء|حذف)(?:\\s+${APPOINTMENT_OBJECT})?|ما\\s+ابغ[ىي]\\s+(?:الموعد|احضر)|(?:please\\s+)?cancel(?:\\s+(?:my\\s+)?(?:appointment|booking))?)(?:\\s|$)`,
  'u'
);
const RESCHEDULE_PATTERN = new RegExp(
  `^(?:${REQUEST_PREFIX}(?:تعديل|اعدل|تعدل|تغيير|تغير|اغير|اعاده جدوله|جدوله|نقل|انقل|تحويل|احول|تاجيل|تااجيل|اجل|اجلي|تاخير|اخر|تقديم|اقدم|قدمي)\\s*${APPOINTMENT_OBJECT}|(?:غيري|عدلي|اجلي|قدمي|حولي|حوليني)\\s*${APPOINTMENT_OBJECT}|${REQUEST_PREFIX}(?:موعد|وقت)\\s+(?:اخر|ثاني|ابكر|اقرب)|في\\s+(?:وقت\\s+ابكر|موعد\\s+اقرب)|خلي\\s+موعدي\\s+(?:يوم\\s+ثاني|بكره)|اعطيني\\s+(?:وقت|موعد)\\s+ثاني|ما\\s+يناسبني\\s+الوقت\\s+ابغى\\s+غيره|الموعد\\s+بعيد\\s+ابغى\\s+ابكر\\s+منه|reschedule|change my appointment|i want to reschedule|can i change my appointment|move my appointment)(?:\\s|$)`,
  'u'
);
const AMBIGUOUS_MANAGEMENT_PATTERN = /^(?:ما راح اقدر اجي بموعدي|ما اقدر احضر|عندي دوام يومها|عندي مشوار طارئ|طرا لي ظرف|ظروفي تغيرت|ما راح يناسبني الموعد)$/u;
const DATE_TIME_EXPRESSION = /(?:اليوم|بكره|بعد بكره|الاسبوع الجاي|الشهر الجاي|الصباح|الصبح|الظهر|العصر|المغرب|بعد الدوام|الليل)/gu;
const CANCELLATION_INFORMATION_PATTERN = /(?:كم\s+رسوم\s+الالغاء|هل\s+الالغاء\s+مجاني|اذا\s+الغيت.*(?:يرجع|استرجاع).*العربون|متى\s+اخر\s+وقت.*الغي|cancell?ation fee|refund.*(?:cancel|cancell))/u;
const APPOINTMENT_QUERY_PATTERN = /(?:متي\s+موعدي|ما\s+هو\s+موعد\s+حجزي|(?:ايش|وش)\s+(?:تفاصيل\s+)?موعدي|هل\s+موعدي\s+مؤكد|(?:وش|ما)\s+رقم\s+حجزي|وين\s+موعدي|عندي\s+موعد\s+اليوم|مين\s+(?:الدكتور|الدكتوره)|اي\s+فرع\s+حجزي|كم\s+باقي\s+علي\s+موعدي|موعدي\s+بكره\s+ولا\s+اليوم|وش\s+وقت\s+موعدي|نسيت\s+موعدي|when is my appointment|what time is my appointment|which branch|who is my doctor)/u;
const AVAILABILITY_PATTERN = /(?:هل\s+يوجد\s+مواعيد\s+متاحه|اقرب\s+موعد|موعد\s+متاح|عندكم\s+(?:موعد\s+)?(?:اليوم|بكره|الخميس|الحين)|فيه\s+(?:مواعيد\s+)?(?:بكره|مساء|صباحي|بعد\s+الدوام)|مين\s+فاضي|وقت\s+فاضي|الدكتوره\s+فاضيه|any slots|any openings|earliest appointment|available tonight)/u;
const CHANGE_SERVICE_PATTERN = /(?:تغيير|تغير|اغير|بدل|بدلي|غيري|switch|change).*(?:الخدمه|فيلر|بوتكس|ليزر|تنظيف|service)|switch to botox/u;
const CHANGE_BRANCH_PATTERN = /(?:تغيير|تغير|اغير|حولي|حول|غيري|خلي).*(?:الفرع|فرع|للصالحيه|للروضه)|(?:change|move to another) branch/u;
const CHANGE_PROVIDER_PATTERN = /(?:تغيير|تغير|اغير|غيري|خلي).*(?:الطبيب|الطبيبه|الدكتور|الدكتوره|د\.)|(?:طبيب|طبيبه|دكتور|دكتوره)\s+(?:اخر|اخرى|ثاني|ثانيه)|different doctor|change doctor/u;
const BULK_CANCEL_PATTERN = /(?:الغي|الغاء|cancel)\s+(?:كل\s+)?(?:مواعيدي|كل مواعيدي|all (?:my )?appointments)/u;
const CONDITIONAL_CONFIRMATION_PATTERN = /^(?:تمام|موافق|نعم|ايوه|ايه|اكيد|اعتمدي|اوكي)\s+(?:بس|لكن)\s+.+/u;
const AMBIGUOUS_GENERAL_PATTERN = /^(?:ما راح اقدر اجي|طرا لي ظرف|ما يناسبني الموعد|عندي ظرف يومها)$/u;
const COMPOUND_CONNECTOR_PATTERN = /(?:\sو(?:اذا|بعدها)?\s*|\sثم\s|\sلو\s|\sاذا\s)/u;
const BOOK_ACTION_PATTERN = /(?:احجز|حجز(?:\s+جديد)?|سجلي\s+لي\s+موعد|اعطيني\s+موعد|حجزيني|احجزي\s+لي|make an appointment|book(?: appointment)?|i want to book)/u;
const SERVICE_BOOKING_PATTERN = /(?:ابي|ابغى|ابغي|اريد|ودي)\s+(?:اسوي\s+)?(?:ليزر|تنظيف\s+بشره|فيلر)|متى\s+اقدر\s+اجي|اقدر\s+امر\s+عليكم/u;

function explicitIntentTypes(text) {
  const types = [];
  if (BULK_CANCEL_PATTERN.test(text)) types.push('bulk_cancel_request');
  if (CHANGE_BRANCH_PATTERN.test(text)) types.push('change_branch_request');
  if (CHANGE_PROVIDER_PATTERN.test(text)) types.push('change_provider_request');
  if (CHANGE_SERVICE_PATTERN.test(text)) types.push('change_service_request');
  if (RESCHEDULE_PATTERN.test(text)) types.push('booking_modification_request');
  if (CANCELLATION_PATTERN.test(text)) types.push('booking_cancellation_request');
  if (BOOK_ACTION_PATTERN.test(text)) types.push('booking');
  return [...new Set(types)];
}

const BLOCKING_INTENTS = Object.freeze([
  { type: 'appointment_management_clarification', pattern: AMBIGUOUS_MANAGEMENT_PATTERN },
  { type: 'booking_cancellation_request', pattern: CANCELLATION_PATTERN },
  { type: 'booking_modification_request', pattern: RESCHEDULE_PATTERN },
  { type: 'booking_status_request', pattern: /(?:حاله|وضع)\s+(?:الحجز|حجزي|الموعد|موعدي)/u },
  { type: 'booking_reference_request', pattern: /(?:ما|وش|وين)?\s*(?:رقم|مرجع)\s+(?:الحجز|حجزي|الموعد)/u },
  { type: 'booking_rejection', pattern: /^(?:لا|ما)\s+(?:ابي|ابغي|اريد|ودي)?\s*(?:حجز|احجز|موعد)/u },
]);

const BOOKING_KEYWORD = /(?:^|\s)(?:حجز|احجز|موعد)(?=\s|$)/u;
const BOOKING_MODIFIER = /(?:^|\s)(?:تاني|ثاني|ثانيه|تانيه|جديد|جديده|اخر|اخرى|اليوم|بكره|غدا|بعد|الاحد|الاثنين|الثلاثاء|الاربعاء|الخميس|الجمعه|السبت|الساعه|ص|م|am|pm|\d{1,2}(?::\d{2})?)(?=\s|$)/gu;
const BOOKING_REFERENCE = '[0-9a-f]{8}';
const LABELED_BOOKING_REFERENCE = new RegExp(
  `(?:رقم|مرجع)\\s+(?:الحجز|حجزي|الموعد|موعدي)\\s*[:#-]?\\s*(${BOOKING_REFERENCE})(?![0-9a-f])`,
  'iu'
);
const CANCELLATION_WITH_REFERENCE = new RegExp(
  `^(?:اريد\\s+)?(?:الغاء|الغي|الغيه)\\s+(?:الحجز|حجزي|موعد|موعدي)\\s*(?:(?:رقم|مرجع)(?:\\s+(?:الحجز|حجزي|الموعد|موعدي))?\\s*[:#-]?\\s*)?(${BOOKING_REFERENCE})(?![0-9a-f])`,
  'iu'
);
const STANDALONE_BOOKING_REFERENCE = new RegExp(
  `^${BOOKING_REFERENCE}$`,
  'iu'
);
const APPOINTMENT_MANAGEMENT_CANCELLATION =
  /^(?:اريد\s+)?(?:الغاء|الغي|الغيه)\s+(?:موعد|موعدي)(?:\s|$)/u;

function isAppointmentManagementCancellation(value) {
  return APPOINTMENT_MANAGEMENT_CANCELLATION.test(normalizeArabic(value));
}

function extractBookingReference(value) {
  const text = normalizeArabic(value);
  if (!text) return null;
  const match = text.match(LABELED_BOOKING_REFERENCE) ||
    text.match(CANCELLATION_WITH_REFERENCE);
  if (match) return match[1].toUpperCase();
  return STANDALONE_BOOKING_REFERENCE.test(text)
    ? text.toUpperCase()
    : null;
}

function resolveBookingIntent(value) {
  const text = normalizeArabic(value);
  if (!text) return null;

  if (CONDITIONAL_CONFIRMATION_PATTERN.test(text)) {
    return { type: 'conditional_confirmation', destructive: false };
  }
  if (CANCELLATION_INFORMATION_PATTERN.test(text)) {
    return { type: 'cancellation_information_request', destructive: false };
  }
  if (BULK_CANCEL_PATTERN.test(text)) {
    return { type: 'bulk_cancel_request', destructive: false };
  }

  const compoundTypes = explicitIntentTypes(text);
  if (COMPOUND_CONNECTOR_PATTERN.test(text) && compoundTypes.length > 1) {
    return {
      type: 'compound_appointment_request',
      intents: compoundTypes,
      conditional: /(?:اذا|لو)/u.test(text),
      destructive: false,
    };
  }

  if (CHANGE_BRANCH_PATTERN.test(text)) return { type: 'change_branch_request' };
  if (CHANGE_PROVIDER_PATTERN.test(text)) return { type: 'change_provider_request' };
  if (CHANGE_SERVICE_PATTERN.test(text)) return { type: 'change_service_request' };
  if (AMBIGUOUS_GENERAL_PATTERN.test(text)) {
    return { type: 'appointment_management_clarification' };
  }
  if (APPOINTMENT_QUERY_PATTERN.test(text)) return { type: 'appointment_query_request' };
  if (AVAILABILITY_PATTERN.test(text)) return { type: 'availability_request' };

  for (const intent of BLOCKING_INTENTS) {
    if (intent.pattern.test(text)) {
      const bookingReference = [
        'booking_cancellation_request', 'booking_modification_request',
      ].includes(intent.type)
        ? extractBookingReference(text)
        : null;
      const dateTimeExpressions = intent.type === 'booking_modification_request'
        ? [...text.matchAll(DATE_TIME_EXPRESSION)].map((match) => match[0])
        : [];
      return {
        type: intent.type,
        ...(bookingReference ? { bookingReference } : {}),
        ...(dateTimeExpressions.length ? { dateTimeExpressions } : {}),
      };
    }
  }

  if (
    SERVICE_BOOKING_PATTERN.test(text) ||
    (BOOK_ACTION_PATTERN.test(text) && !BOOKING_KEYWORD.test(text))
  ) {
    return { type: 'booking', serviceText: null };
  }

  const bookingKeyword = text.match(BOOKING_KEYWORD);
  if (!bookingKeyword) return null;
  const afterKeyword = text.slice(bookingKeyword.index + bookingKeyword[0].length).trim();
  const serviceText = afterKeyword.replace(BOOKING_MODIFIER, ' ').replace(/\s+/g, ' ').trim();
  return {
    type: 'booking',
    serviceText: serviceText || null,
  };
}

module.exports = Object.freeze({
  extractBookingReference,
  isAppointmentManagementCancellation,
  resolveBookingIntent,
});
