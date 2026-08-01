// src/channels/whatsapp/WhatsAppController.js

const WhatsAppWebhookParser = require('./WhatsAppWebhookParser');

class WhatsAppController {
  /**
   * @param {Object} shadenService -实例 من عقل شادن (Composition Root)
   */
  constructor(shadenService) {
    this.shadenService = shadenService;
  }

  /**
   * التحقق من الـ Webhook (يطلبه Meta مرة واحدة عند الإعداد)
   */
  async verifyWebhook(request, reply) {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      console.log('✅ WhatsApp Webhook Verified Successfully!');
      return reply.code(200).send(challenge);
    }

    return reply.code(403).send('Forbidden');
  }

  /**
   * استقبال الرسائل من Meta
   */
  async receiveWebhook(request, reply) {
    // 1. الرد الفوري على Meta (يجب أن يكون خلال 5 ثوانٍ)
    reply.code(200).send();

    // 2. تفريغ الـ Payload
    const rawMessage = WhatsAppWebhookParser.parse(request.body);

    if (!rawMessage) {
      return; // إذا كان مجرد تحديث حالة (Delivered/Read) نتجاهله
    }
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
}

module.exports = WhatsAppController;
