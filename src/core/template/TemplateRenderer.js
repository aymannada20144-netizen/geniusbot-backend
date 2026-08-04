'use strict';

const {
  TemplateValidator,
} = require('./TemplateValidator');

const OPTIONAL_PLACEHOLDER_POLICY = Object.freeze({
  EMPTY_STRING: 'empty_string',
  KEEP_TOKEN: 'keep_token',
});

class TemplateRenderer {
  constructor({
    validator = new TemplateValidator(),
  } = {}) {
    if (
      !validator ||
      typeof validator.validate !== 'function'
    ) {
      throw new TypeError(
        'Template validator must expose a validate function.'
      );
    }

    this.validator = validator;
  }

  render(
    template,
    context = {},
    {
      requiredPlaceholders = [],
      reportUnusedContext = true,
      optionalPlaceholderPolicy =
        OPTIONAL_PLACEHOLDER_POLICY.EMPTY_STRING,
    } = {}
  ) {
    this.#validateOptionalPlaceholderPolicy(
      optionalPlaceholderPolicy
    );

    const validation = this.validator.validate(
      template,
      context,
      {
        requiredPlaceholders,
        reportUnusedContext,
      }
    );

    if (!validation.isValid) {
      return this.#createResult({
        body: null,
        validation,
        rendered: false,
        optionalPlaceholderPolicy,
      });
    }

    const body = this.#renderBody({
      template,
      context,
      validation,
      optionalPlaceholderPolicy,
    });

    return this.#createResult({
      body,
      validation,
      rendered: true,
      optionalPlaceholderPolicy,
    });
  }

  #renderBody({
    template,
    context,
    validation,
    optionalPlaceholderPolicy,
  }) {
    const missingOptionalSet = new Set(
      validation.missingOptionalPlaceholders
    );

    return template.replace(
      /\{\{\s*([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\s*\}\}/g,
      (token, placeholder) => {
        if (
          Object.prototype.hasOwnProperty.call(
            context,
            placeholder
          ) &&
          this.#isUsableValue(context[placeholder])
        ) {
          return String(context[placeholder]);
        }

        if (missingOptionalSet.has(placeholder)) {
          if (
            optionalPlaceholderPolicy ===
            OPTIONAL_PLACEHOLDER_POLICY.KEEP_TOKEN
          ) {
            return token;
          }

          return '';
        }

        return token;
      }
    );
  }

  #isUsableValue(value) {
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

  #createResult({
    body,
    validation,
    rendered,
    optionalPlaceholderPolicy,
  }) {
    return Object.freeze({
      body,
      rendered,
      isValid: validation.isValid,

      optionalPlaceholderPolicy,

      placeholdersUsed: Object.freeze([
        ...validation.uniquePlaceholders,
      ]),

      duplicatePlaceholders: Object.freeze([
        ...validation.duplicatePlaceholders,
      ]),

      missingRequiredPlaceholders: Object.freeze([
        ...validation.missingRequiredPlaceholders,
      ]),

      missingOptionalPlaceholders: Object.freeze([
        ...validation.missingOptionalPlaceholders,
      ]),

      unusedContextKeys: Object.freeze([
        ...validation.unusedContextKeys,
      ]),

      errors: Object.freeze([
        ...validation.errors,
      ]),

      warnings: Object.freeze([
        ...validation.warnings,
      ]),

      validation,
    });
  }

  #validateOptionalPlaceholderPolicy(policy) {
    if (
      !Object.values(
        OPTIONAL_PLACEHOLDER_POLICY
      ).includes(policy)
    ) {
      throw new TypeError(
        'Optional placeholder policy is invalid.'
      );
    }
  }
}

module.exports = Object.freeze({
  TemplateRenderer,
  OPTIONAL_PLACEHOLDER_POLICY,
});