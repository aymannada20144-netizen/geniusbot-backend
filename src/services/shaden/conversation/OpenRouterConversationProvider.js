'use strict';

class OpenRouterConversationProvider {
  constructor({ apiKey, baseUrl, model, timeoutMs = 30000 } = {}) {
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new TypeError('OpenRouterConversationProvider requires an API key');
    }

    if (typeof model !== 'string' || !model.trim()) {
      throw new TypeError('OpenRouterConversationProvider requires a model');
    }

    this.apiKey = apiKey.trim();
    this.baseUrl = String(baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    this.model = model.trim();
    this.timeoutMs = timeoutMs;
  }

  async complete(messages, tools) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages,
          tools,
          tool_choice: 'auto',
        }),
        signal: controller.signal,
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body?.error?.message ||
          `OpenRouter request failed with status ${response.status}`
        );
      }

      const assistantMessage = body?.choices?.[0]?.message || {};

      return {
        content: typeof assistantMessage.content === 'string'
          ? assistantMessage.content
          : null,
        toolCalls: Array.isArray(assistantMessage.tool_calls)
          ? assistantMessage.tool_calls
          : [],
        assistantMessage,
        model: body?.model || this.model,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async completeTopicCandidate({ currentMessage, clinicName = null } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: topicCandidatePrompt(clinicName) },
            { role: 'user', content: String(currentMessage || '') },
          ],
        }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || `OpenRouter request failed with status ${response.status}`);
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') return null;
      try { return JSON.parse(content); } catch { return null; }
    } finally {
      clearTimeout(timer);
    }
  }
}

function topicCandidatePrompt(clinicName) {
  return [
    'استخرجي اقتراحًا صغيرًا لموضوع هذه الرسالة الحالية فقط.',
    'أعيدي JSON فقط بالشكل {"shouldUpdateTopic":boolean,"topicText":string|null}.',
    'اجعلي shouldUpdateTopic=false عندما لا تحتوي الرسالة على موضوع جوهري للمستخدمة، مثل التحية أو الشكر أو الإقرار أو الجواب المختصر أو سؤال عن ذاكرة المحادثة أو طلب متابعة حديث سابق أو طلب مساعدة/تنقل عام.',
    'عند true، topicText يجب أن يكون وصفًا قصيرًا من ألفاظ الرسالة نفسها فقط، بلا تشخيص أو سبب أو معلومة مستنتجة أو صياغة رسالة كاملة.',
    clinicName ? `سياق العيادة: ${clinicName}. لا تستخدميه لإضافة موضوع غير مذكور.` : '',
  ].filter(Boolean).join(' ');
}

module.exports = Object.assign(OpenRouterConversationProvider, { topicCandidatePrompt });
