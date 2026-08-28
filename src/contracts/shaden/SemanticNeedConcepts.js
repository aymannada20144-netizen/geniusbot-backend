'use strict';

const NEED_CONCEPTS = Object.freeze([
  'PIGMENTATION',
  'ACNE_ACTIVE',
  'ACNE_SCARRING',
  'SKIN_TEXTURE',
  'UNWANTED_HAIR',
  'EXPRESSION_LINES',
  'VOLUME_LOSS',
  'FACIAL_CONTOUR',
  'UNKNOWN',
]);

const NEED_QUALIFIERS = Object.freeze([
  'SUN_EXPOSURE',
]);

module.exports = Object.freeze({ NEED_CONCEPTS, NEED_QUALIFIERS });
