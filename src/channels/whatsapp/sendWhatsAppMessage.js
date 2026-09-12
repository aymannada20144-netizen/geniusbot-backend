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
  const hasTemplateName = Boolean(
    Object.getOwnPropertyDescriptor(input, 'templateName')
  );
  const hasBody = Boolean(
    Object.getOwnPropertyDescriptor(input, 'body')
  );
  const hasInteraction = Boolean(
    Object.getOwnPropertyDescriptor(input, 'interaction')
  );
  const isTemplateMessage = hasTemplateName || (!hasBody && !hasInteraction);
  const isTextMessage = !isTemplateMessage;
  const explicitBody = nonEmptyString(ownDataValue(input, 'body'))
    ? ownDataValue(input, 'body')
    : null;
  const templateName = isTemplateMessage
    ? requiredString(input, 'templateName')
    : null;
  const language = isTemplateMessage ? requiredString(input, 'language') : null;
  const templateComponents = isTemplateMessage
    ? optionalTemplateComponents(input)
    : null;
  const interaction = isTextMessage
    ? ownDataValue(input, 'interaction')
    : undefined;
  const body = isTextMessage && interaction === undefined
    ? requiredString(input, 'body')
    : explicitBody;
  const interactivePayload = interaction === undefined
    ? null
    : buildInteractivePayload({ to, body, interaction });
  const render = describeOutboundRender({ interaction, interactivePayload, body });
  logInfo(runtime.logger || console, {
    event: 'WHATSAPP_OUTBOUND_RENDER',
    OUTBOUND_RENDER_MODE: render.mode,
    fallbackReason: render.fallbackReason,
    interactionType: interaction?.mode || null,
    purpose: interaction?.purpose || null,
    optionCount: Array.isArray(interaction?.options) ? interaction.options.length : 0,
    firstOptionId: optionIdAt(interaction, 0),
    lastOptionId: optionIdAt(interaction, -1),
  });
  if (isTextMessage && interactivePayload === null && body === null) {
    throw new TypeError(
      'sendWhatsAppMessage: body must be a non-empty string.'
    );
  }
      const endpoint =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/` +
    `${env.whatsapp.phoneNumberId}/messages`;
  const diagnostics = safeRuntimeDiagnostics({ endpoint, recipient: to });

  let response;

  try {
    response = await (runtime.httpClient || axios).post(
      endpoint,
      interactivePayload || (isTextMessage ? {
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
          ...(templateComponents ? { components: templateComponents } : {}),
        },
      }),
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
    logOutboundResult(runtime.logger || console, render.mode, false, status, null);
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
    logOutboundResult(runtime.logger || console, render.mode, false, status, null);
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
    logOutboundResult(runtime.logger || console, render.mode, false, status, null);
    throw failure;
  }

  logOutboundResult(runtime.logger || console, render.mode, true, status, messageId);
  return Object.freeze({
    messageId,
  });
}

function optionalTemplateComponents(input) {
  const descriptor = Object.getOwnPropertyDescriptor(input, 'components');
  if (!descriptor) return null;
  if (!Array.isArray(descriptor.value) || descriptor.value.length === 0) {
    throw new TypeError('sendWhatsAppMessage: components must be a non-empty array when supplied.');
  }
  for (const component of descriptor.value) {
    if (!isPlainObject(component) || !nonEmptyString(component.type)) {
      throw new TypeError('sendWhatsAppMessage: each template component must have a type.');
    }
    if (component.parameters !== undefined && !Array.isArray(component.parameters)) {
      throw new TypeError('sendWhatsAppMessage: component.parameters must be an array when supplied.');
    }
  }
  return descriptor.value;
}

function buildInteractivePayload({ to, body, interaction }) {
  if (!validInteraction(interaction)) return null;

  if (interaction.mode === 'reply_buttons') {
    const bodyText = nonEmptyString(body) ? body : interaction.displayText;
    if (
      interaction.displayText.length > 1024 ||
      bodyText.length > 1024 ||
      interaction.options.length > 3 ||
      interaction.options.some((option) =>
        option.label.length > 20 ||
        option.id.length > 256 ||
        option.description !== undefined
      )
    ) return null;

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: interaction.options.map((option) => ({
            type: 'reply',
            reply: { id: option.id, title: option.label },
          })),
        },
      },
    };
  }

  if (
    interaction.displayText.length > 4096 ||
    interaction.listPrompt.length > 20 ||
    interaction.options.length > 10 ||
    interaction.options.some((option) =>
      option.label.length > 24 ||
      option.id.length > 200 ||
      (option.description !== undefined && option.description.length > 72)
    )
  ) return null;

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: interaction.displayText },
      action: {
        button: interaction.listPrompt,
        sections: [{
          title: 'الخيارات',
          rows: interaction.options.map((option) => ({
            id: option.id,
            title: option.label,
            ...(option.description === undefined
              ? {}
              : { description: option.description }),
          })),
        }],
      },
    },
  };
}

function validInteraction(interaction) {
  if (!isPlainObject(interaction)) return false;
  if (interaction.version !== 1) return false;
  if (!['reply_buttons', 'list'].includes(interaction.mode)) return false;
  if (!nonEmptyString(interaction.purpose)) return false;
  if (!nonEmptyString(interaction.displayText)) return false;
  if (!Array.isArray(interaction.options) || interaction.options.length === 0) {
    return false;
  }
  if (interaction.mode === 'list' && !nonEmptyString(interaction.listPrompt)) {
    return false;
  }
  if (
    interaction.mode === 'reply_buttons' &&
    interaction.listPrompt !== undefined
  ) return false;

  const ids = new Set();
  for (const option of interaction.options) {
    if (!isPlainObject(option)) return false;
    if (!nonEmptyString(option.id) || !nonEmptyString(option.label)) return false;
    if (
      option.description !== undefined &&
      !nonEmptyString(option.description)
    ) return false;
    if (ids.has(option.id)) return false;
    ids.add(option.id);
  }
  return true;
}

function describeOutboundRender({ interaction, interactivePayload, body }) {
  if (interaction === undefined) return { mode: 'text_or_template', fallbackReason: null };
  if (interactivePayload) return { mode: interaction.mode === 'list' ? 'interactive_list' : 'interactive_buttons', fallbackReason: null };
  return { mode: 'text_fallback', fallbackReason: interactionFallbackReason(interaction, body) };
}

function interactionFallbackReason(interaction, body) {
  if (!isPlainObject(interaction)) return 'invalid_interaction_object';
  if (interaction.version !== 1) return 'invalid_interaction_version';
  if (!['reply_buttons', 'list'].includes(interaction.mode)) return 'invalid_interaction_type';
  if (!nonEmptyString(interaction.purpose)) return 'invalid_purpose';
  if (!nonEmptyString(interaction.displayText)) return 'invalid_display_text';
  if (!Array.isArray(interaction.options) || interaction.options.length === 0) return 'empty_options';
  if (interaction.mode === 'list' && !nonEmptyString(interaction.listPrompt)) return 'invalid_list_prompt';
  if (interaction.mode === 'reply_buttons' && interaction.listPrompt !== undefined) return 'invalid_button_section';
  const ids = new Set();
  for (const option of interaction.options) {
    if (!isPlainObject(option)) return 'invalid_option';
    if (!nonEmptyString(option.id)) return 'invalid_id';
    if (!nonEmptyString(option.label)) return 'invalid_label';
    if (option.description !== undefined && !nonEmptyString(option.description)) return 'invalid_description';
    if (ids.has(option.id)) return 'duplicate_id';
    ids.add(option.id);
  }
  if (interaction.mode === 'reply_buttons') {
    const bodyText = nonEmptyString(body) ? body : interaction.displayText;
    if (interaction.displayText.length > 1024) return 'display_text_over_meta_limit';
    if (bodyText.length > 1024) return 'body_over_meta_limit';
    if (interaction.options.length > 3) return 'options_over_meta_limit';
    if (interaction.options.some((option) => option.label.length > 20)) return 'label_over_meta_limit';
    if (interaction.options.some((option) => option.id.length > 256)) return 'id_over_meta_limit';
    if (interaction.options.some((option) => option.description !== undefined)) return 'invalid_button_description';
    return 'interactive_render_unavailable';
  }
  if (interaction.displayText.length > 4096) return 'display_text_over_meta_limit';
  if (interaction.listPrompt.length > 20) return 'list_prompt_over_meta_limit';
  if (interaction.options.length > 10) return 'options_over_meta_limit';
  if (interaction.options.some((option) => option.label.length > 24)) return 'label_over_meta_limit';
  if (interaction.options.some((option) => option.id.length > 200)) return 'id_over_meta_limit';
  if (interaction.options.some((option) => option.description !== undefined && option.description.length > 72)) return 'description_over_meta_limit';
  return 'interactive_render_unavailable';
}

function optionIdAt(interaction, index) {
  if (!Array.isArray(interaction?.options) || interaction.options.length === 0) return null;
  const option = interaction.options[index < 0 ? interaction.options.length + index : index];
  return typeof option?.id === 'string' ? option.id : null;
}

function logInfo(logger, entry) {
  if (typeof logger?.info === 'function') logger.info(entry);
}

function logOutboundResult(logger, renderMode, success, status, messageId) {
  logInfo(logger, {
    event: 'WHATSAPP_OUTBOUND_RESULT',
    OUTBOUND_RENDER_MODE: renderMode,
    httpSuccess: success,
    httpStatus: Number.isFinite(status) ? status : null,
    metaMessageId: messageId,
  });
}

function ownDataValue(object, propertyName) {
  const descriptor = Object.getOwnPropertyDescriptor(object, propertyName);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ? descriptor.value
    : undefined;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
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
