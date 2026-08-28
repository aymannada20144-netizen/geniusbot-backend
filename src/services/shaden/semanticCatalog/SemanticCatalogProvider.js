'use strict';

const Groq = require('groq-sdk');
const {
  SEMANTIC_CATALOG_SCHEMA,
  validateSemanticCatalogMeaning,
} = require('./SemanticCatalogContract');

const MODEL = 'openai/gpt-oss-20b';
const SYSTEM_PROMPT = [
  'Interpret free-form human language inside a dermatology and aesthetic clinic receptionist conversation.',
  'This frame is context for understanding only; it is not clinic truth and must not force ordinary social or operational language into a cosmetic concern.',
  'Determine only whether the current human message seeks an informational answer.',
  'A message presenting a dermatology or aesthetic concern for help or suitability guidance seeks an informational answer even when it has no question punctuation; unrelated statements do not.',
  'Return atomic semantic references materially relevant to answering that inquiry.',
  'Each reference must contain exactly one independently groundable semantic unit.',
  'Classify each atom only as CATALOG_REFERENCE, DESCRIBED_NEED, or LOCATION_REFERENCE.',
  'A location qualifying another atom must be a separate LOCATION_REFERENCE and linked only by atLocationReferenceIndex.',
  'References are human meaning only and are never authoritative clinic facts.',
  'Do not infer identifiers, availability, routing, tools, operations, or action authorization.',
  'For statements or action requests that do not seek information, set answerNeeded to false.',
  'Preserve described needs as references without diagnosing or inventing a clinic mapping.',
  'For DESCRIBED_NEED, preserve the exact relevant user surface and classify only with the closed concept enum and closed qualifier enum in the response schema.',
  'Concept definitions: PIGMENTATION is uneven or darkened pigment; ACNE_ACTIVE is current pimples or inflammation; ACNE_SCARRING is residual acne marks or scars; SKIN_TEXTURE is uneven surface texture; UNWANTED_HAIR is a desire to reduce unwanted hair; EXPRESSION_LINES is movement-related lines; VOLUME_LOSS is loss of facial volume; FACIAL_CONTOUR is a desire to define facial shape or contour; UNKNOWN is anything not safely covered.',
  'Use qualifier SUN_EXPOSURE only when sun exposure is material to the described concern.',
  'Use UNKNOWN when no allowed concept accurately represents the need; never choose a nearest concept.',
  'Do not treat an explicit clinic service name as a DESCRIBED_NEED.',
].join(' ');

class SemanticCatalogProvider {
  constructor({ apiKey, client = null, timeoutMs = 30000 } = {}) {
    if (!client && (typeof apiKey !== 'string' || !apiKey.trim())) {
      throw new TypeError('SemanticCatalogProvider requires a Groq API key');
    }
    this.client = client || new Groq({ apiKey: apiKey.trim(), maxRetries: 0, timeout: timeoutMs });
  }

  async understand(currentMessage) {
    const startedAt = Date.now();
    let completion = null;
    try {
      completion = await this.client.chat.completions.create({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: String(currentMessage || '') },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'shaden_catalog_meaning', strict: true, schema: SEMANTIC_CATALOG_SCHEMA },
        },
      });
      let meaning = null;
      try { meaning = JSON.parse(completion.choices?.[0]?.message?.content); } catch {}
      const validation = validateSemanticCatalogMeaning(meaning);
      return {
        status: validation.valid ? 'OK' : 'INVALID', meaning,
        validationErrors: validation.errors,
        telemetry: telemetry(completion, Date.now() - startedAt, null),
      };
    } catch (error) {
      return {
        status: 'FAILED', meaning: null, validationErrors: [],
        telemetry: telemetry(null, Date.now() - startedAt, error),
      };
    }
  }
}

function telemetry(completion, latencyMs, error) {
  return {
    model: MODEL, latencyMs, usage: completion?.usage || null,
    failureStatus: error ? String(error.status || error.code || error.name || 'FAILED').slice(0, 80) : null,
    callCount: 1,
  };
}

module.exports = Object.assign(SemanticCatalogProvider, { MODEL, SYSTEM_PROMPT });
