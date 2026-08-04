'use strict';

const MessageTemplateResolver = require(
  './MessageTemplateResolver'
);

const {
  MessageContextBuilder,
  DEFAULT_TIMEZONE,
  DEFAULT_LOCALE,
  MESSAGE_CONTEXT_KEYS,
} = require('./MessageContextBuilder');

module.exports = Object.freeze({
  MessageTemplateResolver,

  MessageContextBuilder,
  DEFAULT_TIMEZONE,
  DEFAULT_LOCALE,
  MESSAGE_CONTEXT_KEYS,
});