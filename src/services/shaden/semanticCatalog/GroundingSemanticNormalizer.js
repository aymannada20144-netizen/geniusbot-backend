'use strict';

class GroundingSemanticNormalizer {
  constructor({
    provider,
  } = {}) {
    if (
      !provider ||
      typeof provider.completeJson !== 'function'
    ) {
      throw new TypeError(
        'GroundingSemanticNormalizer requires provider.completeJson().'
      );
    }

    this.provider = provider;
  }

  async normalize({
    surface,
    sourceText = null,
  } = {}) {
    if (
      typeof surface !== 'string' ||
      !surface.trim()
    ) {
      throw new TypeError(
        'surface must be a non-empty string.'
      );
    }

    const input =
      surface.trim();

    const context =
      typeof sourceText === 'string' &&
      sourceText.trim()
        ? sourceText.trim()
        : input;

    const messages = [
      {
        role: 'system',
        content: [
          'You are a semantic understanding component',
          'for a clinic receptionist.',
          '',
          'Return JSON only:',
          '{"meaning":"..."}',
          '',
          'Restate the meaning of SURFACE in concise Arabic.',
          'Use SOURCE_TEXT only to disambiguate SURFACE and recover omitted referents, body area, or intended meaning.',
          'Preserve the concern, desired result, and body area when supported by SURFACE or SOURCE_TEXT.',
          'Express the meaning itself, not a narrative about the customer.',
          'Do not map the phrase to any clinic service.',
          'Do not name a treatment unless the customer named it.',
          'Do not diagnose.',
          'Do not add medical or clinic facts.',
          'When SURFACE is vague or referential, use SOURCE_TEXT to preserve its explicit antecedent when the text establishes one.',
          'Negated or contrasted text may be used to resolve what SURFACE refers to.',
          'Keep negated information negated; never turn it into a positive target.',
          'Do not infer diagnoses, categories, or alternative concerns that are not explicitly supported by SURFACE or SOURCE_TEXT.',
          'Do not add details not supported by SURFACE or SOURCE_TEXT.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          'SURFACE:',
          input,
          '',
          'SOURCE_TEXT:',
          context,
        ].join('\n'),
      },
    ];

    const response =
      await this.provider.completeJson(
        messages
      );

    const result =
      response?.result;

    if (
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result)
    ) {
      throw new Error(
        'Invalid semantic normalization result.'
      );
    }

    const keys =
      Object.keys(result);

    if (
      keys.length !== 1 ||
      keys[0] !== 'meaning'
    ) {
      throw new Error(
        'Semantic normalization must return meaning only.'
      );
    }

    if (
      typeof result.meaning !== 'string' ||
      !result.meaning.trim()
    ) {
      throw new Error(
        'Semantic normalization meaning is invalid.'
      );
    }

    return Object.freeze({
      surface: input,

      meaning:
        result.meaning.trim(),

      model:
        response.model || null,

      usage:
        response.usage || null,
    });
  }
}

module.exports =
  GroundingSemanticNormalizer;
