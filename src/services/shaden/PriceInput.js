'use strict';
const { normalizeArabic } = require('./ShadenArabicNormalizer');
const { matches } = require('./PriceCatalogMatcher');
const PRICE_WORDS = new Set(['سعر', 'اسعار', 'تكلفه', 'بكم', 'بكام', 'اسعاركم', 'سعرها']);
const GENERAL_WORDS = new Set(['ما', 'هي', 'كم', 'الخدمات', 'خدماتكم', 'الخدمه']);
const AFFIRMATIVE = new Set(['نعم', 'اي', 'ايوه', 'ايوا', 'تمام', 'موافق', 'اكيد', 'احجز', 'احجزي', 'حجز']);
const KEYBOARD = Object.freeze({
  q: 'ض', w: 'ص', e: 'ث', r: 'ق', t: 'ف', y: 'غ', u: 'ع', i: 'ه', o: 'خ', p: 'ح',
  '[': 'ج', ']': 'د', a: 'ش', s: 'س', d: 'ي', f: 'ب', g: 'ل', h: 'ا', j: 'ت',
  k: 'ن', l: 'م', ';': 'ك', "'": 'ط', z: 'ئ', x: 'ء', c: 'ؤ', v: 'ر', b: 'لا',
  n: 'ى', m: 'ة', ',': 'و', '.': 'ز', '/': 'ظ',
});
const tokens = text => normalizeArabic(text).split(' ').filter(Boolean);
const isPrice = text => tokens(text).some(word => PRICE_WORDS.has(word));
const isGeneral = text => isPrice(text) && tokens(text).every(word => PRICE_WORDS.has(word) || GENERAL_WORDS.has(word));
function normalizeInput(message, catalog = {}) {
  const raw = String(message?.text ?? message ?? '');
  if ((raw.match(/[a-z]/gi) || []).length / Math.max(1, (raw.match(/\S/g) || []).length) < 0.75) return raw;
  const converted = [...raw.toLowerCase()].map(char => KEYBOARD[char] ?? char).join('');
  return isPrice(converted) && (isGeneral(converted) || matches(converted, catalog.services).length) ? converted : raw;
}
module.exports = { normalizeInput, isPrice, isGeneral, tokens,
  matchedPriceTokens: text => tokens(text).filter(word => PRICE_WORDS.has(word)),
  isApproval: text => tokens(text).length === 1 && AFFIRMATIVE.has(tokens(text)[0]) };
