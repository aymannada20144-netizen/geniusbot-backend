'use strict';

const { normalizeArabic } = require('./ShadenArabicNormalizer');

const BLOCKING_INTENTS = Object.freeze([
  { type: 'booking_cancellation_request', pattern: /^(?:الغاء|الغي|الغيه)\s+(?:الحجز|حجزي|موعد|موعدي)(?:\s|$)/u },
  { type: 'booking_modification_request', pattern: /^(?:اريد|ابي|ابغي|ودي|ممكن)?\s*(?:تعديل|اعدل|تغيير|اغير|اعاده جدوله|جدوله)\s+(?:الحجز|حجزي|الموعد|موعدي)(?:\s|$)/u },
  { type: 'booking_status_request', pattern: /(?:حاله|وضع)\s+(?:الحجز|حجزي|الموعد|موعدي)/u },
  { type: 'booking_reference_request', pattern: /(?:ما|وش|وين)?\s*(?:رقم|مرجع)\s+(?:الحجز|حجزي|الموعد)/u },
  { type: 'booking_rejection', pattern: /^(?:لا|ما)\s+(?:ابي|ابغي|اريد|ودي)?\s*(?:حجز|احجز|موعد)/u },
]);

const BOOKING_PREFIX = /^(?:(?:هل\s+اقدر|ممكن|ودي|ابي|ابغي|اريد|اود|ارغب|حاب|حابه|عايز|عايزه)\s+)?(?:حجز|احجز|موعد)(?:\s+لي)?(?:\s+|$)/u;
const BOOKING_SUFFIX = /^(?:جديد|جديده|اخر|اخرى|ثاني|ثانيه|موعد)$/u;

function resolveBookingIntent(value) {
  const text = normalizeArabic(value);
  if (!text) return null;

  for (const intent of BLOCKING_INTENTS) {
    if (intent.pattern.test(text)) return { type: intent.type };
  }

  if (!BOOKING_PREFIX.test(text)) return null;
  let serviceText = text.replace(BOOKING_PREFIX, '').trim();
  if (BOOKING_SUFFIX.test(serviceText)) serviceText = '';
  return {
    type: 'booking',
    serviceText: serviceText || null,
  };
}

module.exports = Object.freeze({ resolveBookingIntent });

