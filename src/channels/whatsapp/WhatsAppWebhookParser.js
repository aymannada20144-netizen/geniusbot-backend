// src/channels/whatsapp/WhatsAppWebhookParser.js

class WhatsAppWebhookParser {
  /**
   * يقوم بتفريغ الـ Payload القادم من Meta واستخراج البيانات الخام فقط
   * @param {Object} body - جسم الطلب القادم من Webhook
   * @returns {Object|null} كائن يحتوي على بيانات الرسالة الخام (RawMessage)
   */
  static parse(body) {
    try {
      if (!body || !body.object || !body.entry || !body.entry[0].changes) {
        return null;
      }

      const value = body.entry[0].changes[0].value;

      // تجاهل تحديثات الحالة (delivered, read, etc.)
      if (!value.messages || value.messages.length === 0) {
        return null;
      }

      const msg = value.messages[0];
      const metadata = value.metadata;

      // البيانات الأساسية المشتركة لجميع أنواع الرسائل
      const rawMessage = {
        channel: 'whatsapp',
        senderPhone: msg.from,
        waMessageId: msg.id,
        senderType: 'patient', // مطابق لـ DB schema
        timestamp: new Date(parseInt(msg.timestamp) * 1000),
        metaPhoneNumberId: metadata.phone_number_id, // تصحيح التسمية
        messageType: msg.type,
        text: null,
        rawPayload: null
      };

      // استخراج النص بناءً على نوع الرسالة
      switch (msg.type) {
        case 'text':
          rawMessage.text = msg.text.body;
          break;

        case 'button':
          // عندما يضغط العميل على زر
          rawMessage.text = msg.button.text;
          rawMessage.rawPayload = msg.button.payload;
          break;

        case 'interactive':
          // عندما يضغط العميل على قائمة أو زر تفاعلي
          if (msg.interactive.type === 'button_reply') {
            rawMessage.text = msg.interactive.button_reply.title;
            rawMessage.rawPayload = msg.interactive.button_reply.id;
          } else if (msg.interactive.type === 'list_reply') {
            rawMessage.text = msg.interactive.list_reply.title;
            rawMessage.rawPayload = msg.interactive.list_reply.id;
          }
          break;

        default:
          // للرسائل غير المدعومة (صور، صوت، فيديو، إلخ)
          rawMessage.text = `[تم استلام رسالة من نوع: ${msg.type}]`;
          rawMessage.rawPayload = msg[msg.type] || null;
          break;
      }

      return rawMessage;

    } catch (error) {
      console.error('❌ Error parsing WhatsApp webhook:', error);
      return null;
    }
  }
}

module.exports = WhatsAppWebhookParser;