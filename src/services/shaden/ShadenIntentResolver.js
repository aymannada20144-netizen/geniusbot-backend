'use strict';

const { normalizeArabic } = require('./ShadenArabicNormalizer');

const BLOCKING_INTENTS = Object.freeze([
  { type: 'booking_cancellation_request', pattern: /^(?:الغاء|الغي|الغيه)\s+(?:الحجز|حجزي|موعد|موعدي)(?:\s|$)/u },
  { type: 'booking_modification_request', pattern: /^(?:اريد|ابي|ابغي|ودي|ممكن)?\s*(?:تعديل|اعدل|تغيير|اغير|اعاده جدوله|جدوله)\s+(?:الحجز|حجزي|الموعد|موعدي)(?:\s|$)/u },
  { type: 'booking_status_request', pattern: /(?:حاله|وضع)\s+(?:الحجز|حجزي|الموعد|موعدي)/u },
  { type: 'booking_reference_request', pattern: /(?:ما|وش|وين)?\s*(?:رقم|مرجع)\s+(?:الحجز|حجزي|الموعد)/u },
  { type: 'booking_rejection', pattern: /^(?:لا|ما)\s+(?:ابي|ابغي|اريد|ودي)?\s*(?:حجز|احجز|موعد)/u },
]);

const BOOKING_KEYWORD = /(?:^|\s)(?:حجز|احجز|موعد)(?=\s|$)/u;
const BOOKING_MODIFIER = /(?:^|\s)(?:تاني|ثاني|ثانيه|تانيه|جديد|جديده|اخر|اخرى|اليوم|بكره|غدا|بعد|الاحد|الاثنين|الثلاثاء|الاربعاء|الخميس|الجمعه|السبت|الساعه|ص|م|am|pm|\d{1,2}(?::\d{2})?)(?=\s|$)/gu;

function resolveBookingIntent(value) {
  const text = normalizeArabic(value);
  if (!text) return null;

  for (const intent of BLOCKING_INTENTS) {
    if (intent.pattern.test(text)) return { type: intent.type };
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

module.exports = Object.freeze({ resolveBookingIntent });
