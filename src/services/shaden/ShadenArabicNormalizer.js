'use strict';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function normalizeArabic(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064b-\u065f]/g, '')
    .replace(/[؟?!،,.]/g, '')
    .replace(/\s+/g, ' ');
}

module.exports = Object.freeze({ normalizeArabic });

