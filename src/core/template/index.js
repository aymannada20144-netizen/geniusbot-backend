'use strict';

const TemplateParser = require('./TemplateParser');

const {
  TemplateValidator,
  VALIDATION_ERROR_CODE,
  VALIDATION_WARNING_CODE,
} = require('./TemplateValidator');

const {
  TemplateRenderer,
  OPTIONAL_PLACEHOLDER_POLICY,
} = require('./TemplateRenderer');

module.exports = Object.freeze({
  TemplateParser,

  TemplateValidator,
  VALIDATION_ERROR_CODE,
  VALIDATION_WARNING_CODE,

  TemplateRenderer,
  OPTIONAL_PLACEHOLDER_POLICY,
});