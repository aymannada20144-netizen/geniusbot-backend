'use strict';

/**
 * Authoritative, channel-independent facts about the assistant.  This is kept
 * separate from conversational wording so no caller can accidentally present
 * the configured display name as a human member of staff.
 */
class AssistantIdentityPolicy {
  describe({ clinicName, assistantIdentity, customerName } = {}) {
    const name = typeof assistantIdentity?.name === 'string' && assistantIdentity.name.trim()
      ? assistantIdentity.name.trim() : 'شادن';
    const clinic = typeof clinicName === 'string' && clinicName.trim()
      ? clinicName.trim() : 'العيادة';
    const greeting = customerName ? ` يا ${customerName}` : '';
    return `أنا ${name}${greeting}، المساعدة الذكية المدعومة بالذكاء الاصطناعي لخدمة مراجعي ${clinic}، ولست موظفة بشرية.`;
  }
}

module.exports = AssistantIdentityPolicy;
