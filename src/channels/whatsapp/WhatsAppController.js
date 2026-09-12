// src/channels/whatsapp/WhatsAppController.js

const WhatsAppWebhookParser = require('./WhatsAppWebhookParser');

class WhatsAppController {
  /**
   * @param {Object} shadenService -实例 من عقل شادن (Composition Root)
   */
  constructor(shadenService, options = {}) {
    this.shadenService = shadenService;
    this.statusHandler = typeof options.statusHandler === 'function'
      ? options.statusHandler
      : null;
    this.verifyToken = typeof options.verifyToken === 'string'
      ? options.verifyToken
      : process.env.VERIFY_TOKEN;
    this.logger = options.logger || console;
  }

  /**
   * التحقق من الـ Webhook (يطلبه Meta مرة واحدة عند الإعداد)
   */
  async verifyWebhook(request, reply) {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    if (mode === 'subscribe' && token === this.verifyToken) {
      this.#log('info', {
        event: 'WHATSAPP_WEBHOOK_VERIFICATION',
        outcome: 'VERIFIED',
      });
      return reply.code(200).send(challenge);
    }

    this.#log('warn', {
      event: 'WHATSAPP_WEBHOOK_VERIFICATION',
      outcome: 'REJECTED',
      mode: typeof mode === 'string' ? mode : null,
      tokenPresent: typeof token === 'string' && token.length > 0,
    });
    return reply.code(403).send('Forbidden');
  }

  /**
   * استقبال الرسائل من Meta
   */
  async receiveWebhook(request, reply) {
    // 1. الرد الفوري على Meta (يجب أن يكون خلال 5 ثوانٍ)
    reply.code(200).send();

    // 2. تفريغ الـ Payload
    const boundary = webhookBoundarySummary(request.body);
    this.#log('info', { event: 'WHATSAPP_WEBHOOK_RECEIVED', ...boundary });
    if (boundary.statusCount > 0 && this.statusHandler) {
      this.statusHandler(request.body).catch((error) => {
        this.#log('error', {
          event: 'WHATSAPP_STATUS_PROCESSING_FAILED',
          name: error?.name || 'Error',
          message: error?.message || 'No error message',
        });
      });
    }

    const rawMessage = WhatsAppWebhookParser.parse(request.body);

    if (!rawMessage) {
      this.#log('info', {
        event: 'WHATSAPP_WEBHOOK_PARSE_RESULT',
        outcome: boundary.messageCount > 0
          ? 'PARSE_REJECTED'
          : boundary.statusCount > 0
            ? (this.statusHandler ? 'STATUS_DISPATCHED' : 'STATUS_IGNORED')
            : 'UNSUPPORTED_IGNORED',
      });
      return;
    }
    this.#log('info', {
      event: 'WHATSAPP_WEBHOOK_PARSE_RESULT',
      outcome: 'DISPATCH',
      messageId: rawMessage.waMessageId || null,
      messageType: rawMessage.messageType || null,
    });
    // 3. تمرير الرسالة لعقل شادن (بشكل غير متزامن حتى لا نعطل السيرفر)
    // ShadenService سيتولى فهم الرسالة، حفظها، وتوجيهها للخدمة المناسبة
    this.shadenService.processMessage(rawMessage)
      .catch(error => {
  console.error('WhatsApp message processing failed.', {
    name: error?.name || 'Error',
    message: error?.message || 'No error message',
    stack: error?.stack || 'No stack trace',
    cause: error?.cause || null,
  });
});
  }

  #log(level, entry) {
    const log = typeof this.logger?.[level] === 'function'
      ? this.logger[level].bind(this.logger)
      : console[level] || console.log;
    log(entry);
  }
}

function webhookBoundarySummary(body) {
  const changes = Array.isArray(body?.entry)
    ? body.entry.flatMap((entry) => Array.isArray(entry?.changes) ? entry.changes : [])
    : [];
  return {
    object: typeof body?.object === 'string' ? body.object : null,
    entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
    changeCount: changes.length,
    fields: [...new Set(changes.map((change) => change?.field).filter((field) => typeof field === 'string'))],
    messageCount: changes.reduce((sum, change) => sum + (Array.isArray(change?.value?.messages) ? change.value.messages.length : 0), 0),
    statusCount: changes.reduce((sum, change) => sum + (Array.isArray(change?.value?.statuses) ? change.value.statuses.length : 0), 0),
  };
}

module.exports = WhatsAppController;
