'use strict';

const { normalizeArabic } = require('./ShadenArabicNormalizer');

function words(value) {
  return normalizeArabic(value).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/u)
    .filter(Boolean).map(word => word.replace(/^ال/u, ''));
}

// A single inserted/deleted letter is allowed only in long Arabic catalog words.
// Latin class codes and short names always require complete-token equality.
function near(a, b) {
  if (a === b) return true;
  if (!/^[\u0621-\u064a]{4,}$/u.test(a) || !/^[\u0621-\u064a]{4,}$/u.test(b) || Math.abs(a.length - b.length) !== 1) return false;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let index = 0;
  while (index < short.length && short[index] === long[index]) index++;
  return short.slice(index) === long.slice(index + 1);
}

function matches(text, items) {
  const input = words(text);
  if (!input.length) return [];
  const full = (items || []).filter(item => [item.name, ...(item.aliases || [])].some(name => {
    const candidate = words(name);
    return candidate.length && candidate.every(word => input.some(token => near(token, word)));
  }));
  if (full.length) return full;
  return (items || []).filter(item => {
    const candidate = words(item.name);
    return input.some(token => candidate.some(word => token.length >= 3 && near(token, word)));
  });
}

module.exports = { matches, words };
