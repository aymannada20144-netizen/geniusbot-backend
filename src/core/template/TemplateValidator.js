'use strict';

const {
  TEMPLATE_PLACEHOLDER_VALUES,
} = require('../../contracts/communication');

const TemplateParser = require('./TemplateParser');

const VALIDATION_ERROR_CODE = Object.freeze({
  UNKNOWN_PLACEHOLDER: 'UNKNOWN_PLACEHOLDER',
  MISSING_REQUIRED_PLACEHOLDER:
    'MISSING_REQUIRED_PLACEHOLDER',
  INVALID_REQUIRED_PLACEHOLDER:
    'INVALID_REQUIRED_PLACEHOLDER',
});

const VALIDATION_WARNING_CODE = Object.freeze({
  MISSING_OPTIONAL_PLACEHOLDER:
    'MISSING_OPTIONAL_PLACEHOLDER',
  UNUSED_CONTEXT_VALUE: 'UNUSED_CONTEXT_VALUE',
});

class TemplateValidator {
  constructor({
    parser = new TemplateParser(),
    approvedPlaceholders = TEMPLATE_PLACEHOLDER_VALUES,
  } = {}) {
    if (
      !parser ||
      typeof parser.parse !== 'function'
    ) {
      throw new TypeError(
        'Template parser must expose a parse function.'
      );
    }

    if (!Array.isArray(approvedPlaceholders)) {
      throw new TypeError(
        'Approved placeholders must be an array.'
      );
    }

    this.parser = parser;
    this.approvedPlaceholders = new Set(
      approvedPlaceholders
    );
  }

  validate(
    template,
    context = {},
    {
      requiredPlaceholders = [],
      reportUnusedContext = true,
    } = {}
  ) {
    this.#validateContext(context);
    this.#validateRequiredPlaceholders(
      requiredPlaceholders
    );

    const parsedTemplate = this.parser.parse(template);

    const templatePlaceholders =
      parsedTemplate.uniquePlaceholders;

    const requiredPlaceholderSet = new Set(
      requiredPlaceholders
    );

    const unknownPlaceholders =
      templatePlaceholders.filter(
        (placeholder) =>
          !this.approvedPlaceholders.has(placeholder)
      );

    const invalidRequiredPlaceholders =
      requiredPlaceholders.filter(
        (placeholder) =>
          !this.approvedPlaceholders.has(placeholder)
      );

    const missingRequiredPlaceholders =
      templatePlaceholders.filter(
        (placeholder) =>
          requiredPlaceholderSet.has(placeholder) &&
          !this.#hasUsableContextValue(
            context,
            placeholder
          )
      );

    const missingOptionalPlaceholders =
      templatePlaceholders.filter(
        (placeholder) =>
          this.approvedPlaceholders.has(placeholder) &&
          !requiredPlaceholderSet.has(placeholder) &&
          !this.#hasUsableContextValue(
            context,
            placeholder
          )
      );

    const unusedContextKeys = reportUnusedContext
      ? Object.keys(context).filter(
          (contextKey) =>
            !templatePlaceholders.includes(contextKey)
        )
      : [];

    const duplicatePlaceholders =
      this.#findDuplicatePlaceholders(
        parsedTemplate.placeholders
      );

    const errors = [
      ...unknownPlaceholders.map((placeholder) =>
        this.#createIssue({
          code:
            VALIDATION_ERROR_CODE.UNKNOWN_PLACEHOLDER,
          placeholder,
          message: `Unknown template placeholder: ${placeholder}.`,
        })
      ),

      ...invalidRequiredPlaceholders.map(
        (placeholder) =>
          this.#createIssue({
            code:
              VALIDATION_ERROR_CODE.INVALID_REQUIRED_PLACEHOLDER,
            placeholder,
            message:
              `Required placeholder is not approved: ${placeholder}.`,
          })
      ),

      ...missingRequiredPlaceholders.map(
        (placeholder) =>
          this.#createIssue({
            code:
              VALIDATION_ERROR_CODE.MISSING_REQUIRED_PLACEHOLDER,
            placeholder,
            message:
              `Required placeholder has no usable context value: ${placeholder}.`,
          })
      ),
    ];

    const warnings = [
      ...missingOptionalPlaceholders.map(
        (placeholder) =>
          this.#createIssue({
            code:
              VALIDATION_WARNING_CODE.MISSING_OPTIONAL_PLACEHOLDER,
            placeholder,
            message:
              `Optional placeholder has no usable context value: ${placeholder}.`,
          })
      ),

      ...unusedContextKeys.map((contextKey) =>
        this.#createIssue({
          code:
            VALIDATION_WARNING_CODE.UNUSED_CONTEXT_VALUE,
          placeholder: contextKey,
          message:
            `Context value is not used by the template: ${contextKey}.`,
        })
      ),
    ];

    return Object.freeze({
      isValid: errors.length === 0,

      template,

      placeholders: Object.freeze([
        ...parsedTemplate.placeholders,
      ]),

      uniquePlaceholders: Object.freeze([
        ...templatePlaceholders,
      ]),

      duplicatePlaceholders: Object.freeze([
        ...duplicatePlaceholders,
      ]),

      requiredPlaceholders: Object.freeze([
        ...requiredPlaceholders,
      ]),

      unknownPlaceholders: Object.freeze([
        ...unknownPlaceholders,
      ]),

      missingRequiredPlaceholders: Object.freeze([
        ...missingRequiredPlaceholders,
      ]),

      missingOptionalPlaceholders: Object.freeze([
        ...missingOptionalPlaceholders,
      ]),

      unusedContextKeys: Object.freeze([
        ...unusedContextKeys,
      ]),

      errors: Object.freeze(errors),
      warnings: Object.freeze(warnings),
    });
  }

  #hasUsableContextValue(context, placeholder) {
    if (
      !Object.prototype.hasOwnProperty.call(
        context,
        placeholder
      )
    ) {
      return false;
    }

    const value = context[placeholder];

    if (value === null || value === undefined) {
      return false;
    }

    if (
      typeof value === 'string' &&
      value.trim() === ''
    ) {
      return false;
    }

    return true;
  }

  #findDuplicatePlaceholders(placeholders) {
    const occurrenceCounts = new Map();

    for (const placeholder of placeholders) {
      occurrenceCounts.set(
        placeholder,
        (occurrenceCounts.get(placeholder) || 0) + 1
      );
    }

    return [...occurrenceCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([placeholder]) => placeholder);
  }

  #createIssue({
    code,
    placeholder,
    message,
  }) {
    return Object.freeze({
      code,
      placeholder,
      message,
    });
  }

  #validateContext(context) {
    if (
      context === null ||
      typeof context !== 'object' ||
      Array.isArray(context)
    ) {
      throw new TypeError(
        'Template context must be an object.'
      );
    }
  }

  #validateRequiredPlaceholders(
    requiredPlaceholders
  ) {
    if (!Array.isArray(requiredPlaceholders)) {
      throw new TypeError(
        'Required placeholders must be an array.'
      );
    }

    for (const placeholder of requiredPlaceholders) {
      if (
        typeof placeholder !== 'string' ||
        placeholder.trim() === ''
      ) {
        throw new TypeError(
          'Every required placeholder must be a non-empty string.'
        );
      }
    }
  }
}

module.exports = Object.freeze({
  TemplateValidator,

  VALIDATION_ERROR_CODE,

  VALIDATION_WARNING_CODE,
});