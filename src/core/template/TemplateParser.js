'use strict';

const PLACEHOLDER_PATTERN =
  /\{\{\s*([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\s*\}\}/g;

class TemplateParser {
  parse(template) {
    this.#validateTemplate(template);

    const placeholders = [];
    let match;

    PLACEHOLDER_PATTERN.lastIndex = 0;

    while ((match = PLACEHOLDER_PATTERN.exec(template)) !== null) {
      placeholders.push(match[1]);
    }

    const uniquePlaceholders = [...new Set(placeholders)];

    return Object.freeze({
      template,
      placeholders: Object.freeze([...placeholders]),
      uniquePlaceholders: Object.freeze([
        ...uniquePlaceholders,
      ]),
      count: placeholders.length,
      uniqueCount: uniquePlaceholders.length,
      hasPlaceholders: placeholders.length > 0,
    });
  }

  extract(template) {
    return this.parse(template).placeholders;
  }

  extractUnique(template) {
    return this.parse(template).uniquePlaceholders;
  }

  hasPlaceholders(template) {
    return this.parse(template).hasPlaceholders;
  }

  #validateTemplate(template) {
    if (typeof template !== 'string') {
      throw new TypeError(
        'Template must be a string.'
      );
    }
  }
}

module.exports = TemplateParser;