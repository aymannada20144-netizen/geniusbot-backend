'use strict';

const {
  isRecoveryChannel,
} = require('../../../constants/recoveryChannel');

const {
  RecoveryMessageBuildError,
} = require('./errors/RecoveryMessageBuildError');

const PLACEHOLDER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Pure, provider-neutral recovery message renderer.
 */
class RecoveryMessageBuilder {
  /**
   * Builds an immutable recovery message payload from caller-provided facts.
   *
   * @param {object} context
   * @returns {Readonly<object>}
   */
  build(context = {}) {
    this.#assertPlainObject(context, 'context');

    const channel = this.#validateChannel(context.channel);
    const language = this.#validateRequiredString(
      context.language,
      'language'
    );
    const template = this.#validateTemplate(context.template);

    this.#assertPlainObject(context.variables, 'variables');

    const diagnosticDetails = {
      templateId: template.id,
      channel,
      language,
    };

    const subjectTokens =
      template.subject === null
        ? null
        : this.#scanTemplate(template.subject, diagnosticDetails);
    const bodyTokens = this.#scanTemplate(
      template.body,
      diagnosticDetails
    );

    const subject =
      subjectTokens === null
        ? null
        : this.#renderTokens(
            subjectTokens,
            context.variables,
            diagnosticDetails
          );
    const body = this.#renderTokens(
      bodyTokens,
      context.variables,
      diagnosticDetails
    );

    const metadata = this.#copyMetadata(context.metadata);
    const payload = {
      channel,
      language,
      subject,
      body,
      metadata,
    };

    return this.#deepFreeze(payload);
  }

  #validateChannel(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new TypeError(
        'RecoveryMessageBuilder: "channel" must be a non-empty string.'
      );
    }

    if (!isRecoveryChannel(value)) {
      throw new TypeError(
        `RecoveryMessageBuilder: unsupported recovery channel "${value}".`
      );
    }

    return value;
  }

  #validateTemplate(value) {
    this.#assertPlainObject(value, 'template');

    const id = this.#validateTemplateId(value.id);
    const body = this.#validateRequiredString(
      value.body,
      'template.body'
    );

    let subject = null;

    if (value.subject !== null && value.subject !== undefined) {
      subject = this.#validateRequiredString(
        value.subject,
        'template.subject'
      );
    }

    return {
      id,
      subject,
      body,
    };
  }

  #validateTemplateId(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const isNonEmptyString =
      typeof value === 'string' && value.trim().length > 0;
    const isFiniteNumber =
      typeof value === 'number' && Number.isFinite(value);

    if (!isNonEmptyString && !isFiniteNumber) {
      throw new TypeError(
        'RecoveryMessageBuilder: "template.id" must be a non-empty string, finite number, or null.'
      );
    }

    return value;
  }

  #scanTemplate(source, diagnosticDetails) {
    const tokens = [];
    let literalStart = 0;
    let cursor = 0;

    while (cursor < source.length) {
      if (source.startsWith('{{', cursor)) {
        if (literalStart < cursor) {
          tokens.push({
            type: 'literal',
            value: source.slice(literalStart, cursor),
          });
        }

        const closingIndex = source.indexOf('}}', cursor + 2);

        if (closingIndex === -1) {
          this.#throwBuildError(
            'Recovery message template contains an unmatched opening delimiter.',
            'INVALID_TEMPLATE_PLACEHOLDER',
            diagnosticDetails,
            null
          );
        }

        const placeholder = source.slice(cursor + 2, closingIndex);

        if (!PLACEHOLDER_NAME_PATTERN.test(placeholder)) {
          this.#throwBuildError(
            'Recovery message template contains an invalid placeholder.',
            'INVALID_TEMPLATE_PLACEHOLDER',
            diagnosticDetails,
            null
          );
        }

        tokens.push({
          type: 'placeholder',
          value: placeholder,
        });

        cursor = closingIndex + 2;
        literalStart = cursor;
        continue;
      }

      if (source.startsWith('}}', cursor)) {
        this.#throwBuildError(
          'Recovery message template contains an unmatched closing delimiter.',
          'INVALID_TEMPLATE_PLACEHOLDER',
          diagnosticDetails,
          null
        );
      }

      cursor += 1;
    }

    if (literalStart < source.length) {
      tokens.push({
        type: 'literal',
        value: source.slice(literalStart),
      });
    }

    return tokens;
  }

  #renderTokens(tokens, variables, diagnosticDetails) {
    const renderedParts = [];

    for (const token of tokens) {
      if (token.type === 'literal') {
        renderedParts.push(token.value);
        continue;
      }

      const placeholder = token.value;

      if (!Object.prototype.hasOwnProperty.call(variables, placeholder)) {
        this.#throwBuildError(
          `Recovery message variable "${placeholder}" is missing.`,
          'MISSING_TEMPLATE_VARIABLE',
          diagnosticDetails,
          placeholder
        );
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        variables,
        placeholder
      );

      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        this.#throwBuildError(
          `Recovery message variable "${placeholder}" is not renderable.`,
          'UNRENDERABLE_VARIABLE_VALUE',
          diagnosticDetails,
          placeholder
        );
      }

      const value = descriptor.value;

      if (!this.#isRenderableValue(value)) {
        this.#throwBuildError(
          `Recovery message variable "${placeholder}" is not renderable.`,
          'UNRENDERABLE_VARIABLE_VALUE',
          diagnosticDetails,
          placeholder
        );
      }

      renderedParts.push(String(value));
    }

    return renderedParts.join('');
  }

  #isRenderableValue(value) {
    return (
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    );
  }

  #copyMetadata(value) {
    if (value === null || value === undefined) {
      return {};
    }

    this.#assertPlainObject(value, 'metadata');

    return this.#copyMetadataValue(value, 'metadata', new WeakSet());
  }

  #copyMetadataValue(value, path, ancestors) {
    if (value === null) {
      return null;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new TypeError(
          `RecoveryMessageBuilder: "${path}" contains a non-finite number.`
        );
      }

      return value;
    }

    if (typeof value !== 'object') {
      throw new TypeError(
        `RecoveryMessageBuilder: "${path}" contains an unsupported value.`
      );
    }

    if (ancestors.has(value)) {
      throw new TypeError(
        `RecoveryMessageBuilder: "${path}" contains a cyclic reference.`
      );
    }

    const isArray = Array.isArray(value);

    if (!isArray && !this.#isPlainObject(value)) {
      throw new TypeError(
        `RecoveryMessageBuilder: "${path}" contains a non-plain object.`
      );
    }

    ancestors.add(value);

    try {
      if (isArray) {
        return this.#copyMetadataArray(value, path, ancestors);
      }

      return this.#copyMetadataObject(value, path, ancestors);
    } finally {
      ancestors.delete(value);
    }
  }

  #copyMetadataArray(value, path, ancestors) {
    const copy = new Array(value.length);
    const copiedIndices = new Set();

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') {
        throw new TypeError(
          `RecoveryMessageBuilder: "${path}" contains a symbol property.`
        );
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (key === 'length') {
        if (
          !descriptor ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.value !== value.length ||
          descriptor.enumerable !== false ||
          descriptor.configurable !== false ||
          descriptor.writable !== true
        ) {
          throw new TypeError(
            `RecoveryMessageBuilder: "${path}.length" has an unsupported descriptor.`
          );
        }

        continue;
      }

      const index = Number(key);
      const isCanonicalIndex =
        Number.isInteger(index) &&
        index >= 0 &&
        index < value.length &&
        String(index) === key;

      if (!isCanonicalIndex) {
        throw new TypeError(
          `RecoveryMessageBuilder: "${path}" contains a custom array property.`
        );
      }

      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        descriptor.enumerable !== true ||
        descriptor.configurable !== true ||
        descriptor.writable !== true
      ) {
        throw new TypeError(
          `RecoveryMessageBuilder: "${path}[${index}]" has an unsupported descriptor.`
        );
      }

      copy[index] = this.#copyMetadataValue(
        descriptor.value,
        `${path}[${index}]`,
        ancestors
      );
      copiedIndices.add(index);
    }

    for (let index = 0; index < value.length; index += 1) {
      if (!copiedIndices.has(index)) {
        throw new TypeError(
          `RecoveryMessageBuilder: "${path}[${index}]" is undefined.`
        );
      }
    }

    return copy;
  }

  #copyMetadataObject(value, path, ancestors) {
    const copy = {};

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') {
        throw new TypeError(
          `RecoveryMessageBuilder: "${path}" contains a symbol property.`
        );
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        descriptor.enumerable !== true
      ) {
        throw new TypeError(
          `RecoveryMessageBuilder: "${path}.${key}" has an unsupported descriptor.`
        );
      }

      const copiedValue = this.#copyMetadataValue(
        descriptor.value,
        `${path}.${key}`,
        ancestors
      );

      Object.defineProperty(copy, key, {
        value: copiedValue,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }

    return copy;
  }

  #deepFreeze(value) {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    for (const key of Object.keys(value)) {
      this.#deepFreeze(value[key]);
    }

    return Object.freeze(value);
  }

  #throwBuildError(
    message,
    reason,
    diagnosticDetails,
    placeholder
  ) {
    throw new RecoveryMessageBuildError(message, {
      reason,
      templateId: diagnosticDetails.templateId,
      placeholder,
      channel: diagnosticDetails.channel,
      language: diagnosticDetails.language,
    });
  }

  #validateRequiredString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(
        `RecoveryMessageBuilder: "${fieldName}" must be a non-empty string.`
      );
    }

    return value;
  }

  #assertPlainObject(value, fieldName) {
    if (!this.#isPlainObject(value)) {
      throw new TypeError(
        `RecoveryMessageBuilder: "${fieldName}" must be a plain object.`
      );
    }
  }

  #isPlainObject(value) {
    if (value === null || typeof value !== 'object') {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
  }
}

module.exports = RecoveryMessageBuilder;
