// src/channels/whatsapp/WhatsAppWebhookParser.js

class WhatsAppWebhookParser {
  /**
   * يقوم بتفريغ الـ Payload القادم من Meta واستخراج البيانات الخام فقط
   * @param {Object} body - جسم الطلب القادم من Webhook
   * @returns {Object|null} كائن يحتوي على بيانات الرسالة الخام (RawMessage)
   */
  static parse(body) {
    try {
      if (!body || !body.object || !Array.isArray(body.entry)) {
        return null;
      }

      const change = body.entry
        .flatMap((entry) => Array.isArray(entry?.changes) ? entry.changes : [])
        .find((item) => Array.isArray(item?.value?.messages) && item.value.messages.length > 0);
      if (!change) {
        return null;
      }
      const value = change.value;

      const msg = value.messages[0];
      const metadata = value.metadata || {};
      const contact = Array.isArray(value.contacts)
        ? value.contacts.find((item) => item.wa_id === msg.from) || value.contacts[0]
        : null;

      // البيانات الأساسية المشتركة لجميع أنواع الرسائل
      const rawMessage = {
        channel: 'whatsapp',
        senderPhone: msg.from,
        waMessageId: msg.id,
        senderType: 'patient', // مطابق لـ DB schema
        timestamp: new Date(parseInt(msg.timestamp) * 1000),
        metaPhoneNumberId: metadata.phone_number_id,
        receiverPhone: metadata.display_phone_number,
        messageType: msg.type,
        contactName: contact?.profile?.name || null,
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
          rawMessage.inputProvenance = trustedProvenance('meta_legacy_button');
          break;

        case 'interactive':
          // عندما يضغط العميل على قائمة أو زر تفاعلي
          if (msg.interactive.type === 'button_reply') {
            rawMessage.text = msg.interactive.button_reply.title;
            rawMessage.rawPayload = msg.interactive.button_reply.id;
            rawMessage.inputProvenance = trustedProvenance('meta_interactive_button');
          } else if (msg.interactive.type === 'list_reply') {
            rawMessage.text = msg.interactive.list_reply.title;
            rawMessage.rawPayload = msg.interactive.list_reply.id;
            rawMessage.inputProvenance = trustedProvenance('meta_interactive_list');
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

function trustedProvenance(kind) {
  return Object.freeze({
    trusted: true,
    source: 'meta_whatsapp',
    kind,
  });
}

module.exports = WhatsAppWebhookParser;
