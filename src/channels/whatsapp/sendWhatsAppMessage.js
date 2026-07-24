'use strict';

const axios = require('axios');
const env = require('../../config/env');

const GRAPH_API_VERSION = 'v25.0';
const OUTBOUND_TIMEOUT_MS = 15000;

async function sendWhatsAppMessage(input) {
  if (!isPlainObject(input)) {
    throw new TypeError(
      'sendWhatsAppMessage: input must be a plain object.'
    );
  }

  const to = requiredString(input, 'to');
  const isTextMessage = Boolean(
    Object.getOwnPropertyDescriptor(input, 'body')
  );
  const body = isTextMessage ? requiredString(input, 'body') : null;
  const templateName = isTextMessage ? null : requiredString(input, 'templateName');
  const language = isTextMessage ? null : requiredString(input, 'language');
  const endpoint =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/` +
    `${env.whatsapp.phoneNumberId}/messages`;

  let response;

  try {
    response = await axios.post(
      endpoint,
      isTextMessage ? {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body },
      } : {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: language,
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${env.whatsapp.token}`,
          'Content-Type': 'application/json',
        },
        timeout: OUTBOUND_TIMEOUT_MS,
        validateStatus: () => true,
      }
    );
  } catch (error) {
    const failureResponse = error && error.response;
    const status = failureResponse && failureResponse.status;

    throw outboundError({
      status,
      metaCode: resolveMetaCode(failureResponse),
      retryable:
        isTimeout(error) ||
        !hasHttpResponse(error) ||
        status === 429 ||
        (status >= 500 && status < 600),
    });
  }

  const status = response && response.status;
  const metaCode = resolveMetaCode(response);

  if (!(status >= 200 && status < 300)) {
    throw outboundError({
      status,
      metaCode,
      retryable: status === 429 || (status >= 500 && status < 600),
    });
  }

  const messageId = resolveMessageId(response);

  if (messageId === null) {
    throw outboundError({
      status,
      metaCode,
      retryable: false,
    });
  }

  return Object.freeze({
    messageId,
  });
}

function requiredString(object, propertyName) {
  const descriptor = Object.getOwnPropertyDescriptor(object, propertyName);

  if (
    !descriptor ||
    !Object.prototype.hasOwnProperty.call(descriptor, 'value')
  ) {
    throw new TypeError(
      `sendWhatsAppMessage: ${propertyName} must be an own data property.`
    );
  }

  if (
    typeof descriptor.value !== 'string' ||
    descriptor.value.trim().length === 0
  ) {
    throw new TypeError(
      `sendWhatsAppMessage: ${propertyName} must be a non-empty string.`
    );
  }

  return descriptor.value;
}

function resolveMessageId(response) {
  const messages = response && response.data && response.data.messages;
  const message = Array.isArray(messages) ? messages[0] : null;
  const messageId = message && message.id;

  return typeof messageId === 'string' && messageId.trim().length > 0
    ? messageId
    : null;
}

function resolveMetaCode(response) {
  const metaCode =
    response &&
    response.data &&
    response.data.error &&
    response.data.error.code;

  return typeof metaCode === 'string' || Number.isFinite(metaCode)
    ? metaCode
    : undefined;
}

function hasHttpResponse(error) {
  return Boolean(error && error.response);
}

function isTimeout(error) {
  return Boolean(
    error &&
    (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
  );
}

function outboundError({ status, metaCode, retryable }) {
  const error = new Error('WhatsApp outbound request failed.');

  error.name = 'WhatsAppOutboundError';

  if (Number.isFinite(status)) {
    error.status = status;
  }

  if (metaCode !== undefined) {
    error.metaCode = metaCode;
  }

  error.retryable = retryable === true;

  return error;
}

function isPlainObject(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

module.exports = sendWhatsAppMessage;

sendWhatsAppMessage.sendText = async function sendText({ recipientId, body, text } = {}) {
  return sendWhatsAppMessage({ to: recipientId, body: body ?? text });
};
