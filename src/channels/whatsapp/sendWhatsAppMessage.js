'use strict';

const axios = require('axios');
const crypto = require('node:crypto');
const env = require('../../config/env');

const GRAPH_API_VERSION = 'v25.0';
const OUTBOUND_TIMEOUT_MS = 15000;

async function sendWhatsAppMessage(input, runtime = {}) {
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
  const diagnostics = safeRuntimeDiagnostics({ endpoint, recipient: to });

  let response;

  try {
    response = await (runtime.httpClient || axios).post(
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
    const failure = outboundError({
      status,
      responseBody: parseResponseBody(failureResponse?.data),
      networkCode: error?.code,
      timeout: isTimeout(error),
      retryable:
        isTimeout(error) ||
        !hasHttpResponse(error) ||
        status === 429 ||
        (status >= 500 && status < 600),
      diagnostics,
    });
    logFailure(runtime.logger || console, failure);
    throw failure;
  }

  const status = response && response.status;

  if (!(status >= 200 && status < 300)) {
    const failure = outboundError({
      status,
      responseBody: parseResponseBody(response?.data),
      retryable: status === 429 || (status >= 500 && status < 600),
      diagnostics,
    });
    logFailure(runtime.logger || console, failure);
    throw failure;
  }

  const messageId = resolveMessageId(response);

  if (messageId === null) {
    const failure = outboundError({
      status,
      responseBody: parseResponseBody(response?.data),
      retryable: false,
      diagnostics,
    });
    logFailure(runtime.logger || console, failure);
    throw failure;
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

function hasHttpResponse(error) {
  return Boolean(error && error.response);
}

function isTimeout(error) {
  return Boolean(
    error &&
    (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
  );
}

function outboundError({
  status,
  responseBody,
  networkCode,
  timeout = false,
  retryable,
  diagnostics,
}) {
  responseBody = parseResponseBody(responseBody);
  const metaError = isPlainObject(responseBody?.error)
    ? responseBody.error
    : {};
  const summary = [
    Number.isFinite(status) ? `HTTP ${status}` : null,
    scalar(metaError.code) != null ? `Meta ${metaError.code}` : null,
    scalar(metaError.message),
  ].filter(Boolean).join(', ');
  const error = new Error(
    `WhatsApp outbound request failed${summary ? ` (${summary})` : ''}.`
  );

  error.name = 'WhatsAppOutboundError';

  if (Number.isFinite(status)) {
    error.status = status;
  }

  if (
    typeof metaError.code === 'string' ||
    Number.isFinite(metaError.code)
  ) {
    error.metaCode = metaError.code;
  }

  error.metaErrorSubcode = scalar(metaError.error_subcode);
  error.metaMessage = scalar(metaError.message);
  error.metaType = scalar(metaError.type);
  error.fbtraceId = scalar(metaError.fbtrace_id);
  error.responseBody = redact(responseBody);
  error.networkCode = scalar(networkCode);
  error.timeout = timeout === true;
  error.retryable = retryable === true;
  error.metaCause = classifyMetaCause(metaError);
  error.runtime = Object.freeze({ ...(diagnostics || {}) });

  return error;
}

function logFailure(logger, error) {
  const details = Object.freeze({
    name: error.name,
    message: error.message,
    status: error.status ?? null,
    errorCode: error.metaCode ?? null,
    errorSubcode: error.metaErrorSubcode ?? null,
    metaMessage: error.metaMessage ?? null,
    errorType: error.metaType ?? null,
    fbtraceId: error.fbtraceId ?? null,
    responseBody: error.responseBody ?? null,
    networkCode: error.networkCode ?? null,
    timeout: error.timeout,
    retryable: error.retryable,
    metaCause: error.metaCause,
    runtime: error.runtime,
  });
  const method = typeof logger?.error === 'function'
    ? logger.error.bind(logger)
    : console.error;
  method('WhatsApp outbound request failed.', details);
}

function parseResponseBody(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function safeRuntimeDiagnostics({ endpoint, recipient }) {
  const token = env.whatsapp.token || '';
  return Object.freeze({
    graphApiVersion: GRAPH_API_VERSION,
    phoneNumberId: env.whatsapp.phoneNumberId,
    tokenPresent: token.length > 0,
    tokenLength: token.length,
    tokenFingerprint: token.length
      ? crypto.createHash('sha256').update(token).digest('hex').slice(0, 12)
      : null,
    recipient,
    endpoint,
    authorizationHeaderPresent: token.length > 0,
  });
}

function classifyMetaCause(metaError) {
  const code = Number(metaError.code);
  const subcode = Number(metaError.error_subcode);
  const message = String(metaError.message || '').toLowerCase();
  if (code === 190 && (subcode === 463 || /expired/.test(message))) {
    return 'expired_token';
  }
  if (code === 190 && /app|application/.test(message)) {
    return 'incorrect_app_token_relationship';
  }
  if (code === 190 || /invalid.*token|access token/.test(message)) {
    return 'invalid_token';
  }
  if (/phone number id|phone_number_id/.test(message)) {
    return 'incorrect_phone_number_id';
  }
  if (/authorization|oauth/.test(message)) return 'authorization_failure';
  return null;
}

function scalar(value) {
  return typeof value === 'string' || Number.isFinite(value)
    ? value
    : undefined;
}

function redact(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = /authorization|access[_-]?token|token/i.test(key)
      ? '[REDACTED]'
      : redact(item, seen);
  }
  return output;
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

sendWhatsAppMessage.getSafeRuntimeDiagnostics = function getSafeRuntimeDiagnostics({
  recipient = null,
} = {}) {
  const endpoint =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/` +
    `${env.whatsapp.phoneNumberId}/messages`;
  return safeRuntimeDiagnostics({ endpoint, recipient });
};
