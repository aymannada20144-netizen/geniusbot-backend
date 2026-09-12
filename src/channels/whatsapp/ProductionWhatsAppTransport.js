'use strict';

const sendWhatsAppMessage = require('./sendWhatsAppMessage');

// Adapts the standard communication message to the established production sender.
// It contains no HTTP implementation, credentials, API-version choice, or Meta-specific retry path.
class ProductionWhatsAppTransport {
  constructor({ sender = sendWhatsAppMessage, runtime = {} } = {}) {
    if (typeof sender !== 'function') throw new TypeError('ProductionWhatsAppTransport requires a sender function.');
    this.sender = sender;
    this.runtime = runtime;
  }

  async send(message) {
    const input = toProductionSenderInput(message);
    const result = await this.sender(input, this.runtime);
    return Object.freeze({
      provider: 'meta',
      channel: 'whatsapp',
      statusCode: null,
      messageId: result?.messageId || null,
      recipient: input.to,
      response: null,
    });
  }
}

function toProductionSenderInput(message) {
  if (!message || message.channel !== 'whatsapp') throw new TypeError('ProductionWhatsAppTransport only supports WhatsApp messages.');
  const phone = requiredString(message?.recipient?.phone, 'message.recipient.phone');
  const name = requiredString(message?.template?.name, 'message.template.name');
  const language = requiredString(message?.template?.language, 'message.template.language');
  const components = resolveComponents(message.template);
  return Object.freeze({
    to: phone,
    templateName: name,
    language,
    ...(components.length > 0 ? { components } : {}),
  });
}

function resolveComponents(template) {
  if (Array.isArray(template.components) && template.components.length > 0) return template.components;
  const values = Object.values(template.variables || {});
  if (values.length === 0) return [];
  if (values.some(value => value === null || value === undefined || (typeof value === 'string' && !value.trim()))) {
    throw new TypeError('ProductionWhatsAppTransport template variables must be non-empty.');
  }
  return [{ type: 'body', parameters: values.map(value => ({ type: 'text', text: String(value) })) }];
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`ProductionWhatsAppTransport ${field} is required.`);
  return value.trim();
}

module.exports = ProductionWhatsAppTransport;
module.exports.toProductionSenderInput = toProductionSenderInput;
