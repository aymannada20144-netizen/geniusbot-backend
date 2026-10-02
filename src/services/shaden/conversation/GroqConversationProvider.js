'use strict';

const Groq = require('groq-sdk');

const MODEL = 'openai/gpt-oss-20b';

class GroqConversationProvider {
  constructor({ apiKey, client = null, timeoutMs = 30000 } = {}) {
    if (!client && (typeof apiKey !== 'string' || !apiKey.trim())) {
      throw new TypeError('GroqConversationProvider requires a Groq API key');
    }
    this.client = client || new Groq({
      apiKey: apiKey.trim(), maxRetries: 0, timeout: timeoutMs,
    });
  }

  async complete(messages, tools) {
    const completion = await this.client.chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages,
      tools,
      tool_choice: 'auto',
    });
    const assistantMessage = completion.choices?.[0]?.message || {};
    return {
      content: typeof assistantMessage.content === 'string'
        ? assistantMessage.content : null,
      toolCalls: Array.isArray(assistantMessage.tool_calls)
        ? assistantMessage.tool_calls : [],
      assistantMessage,
      model: completion.model || MODEL,
    };
  }

  async completeTopicCandidate({ currentMessage } = {}) {
    const completion = await this.client.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'أعيدي JSON فقط بالشكل {"shouldUpdateTopic":boolean,"topicText":string|null}. اقترحي موضوعًا صغيرًا من ألفاظ الرسالة الحالية فقط عندما تكون ذات موضوع جوهري. لا تقترحي موضوعًا للتحية أو الشكر أو الإقرار أو الجواب المختصر أو سؤال الذاكرة أو متابعة حديث سابق أو طلب مساعدة عام. لا تضيفي تشخيصًا أو استنتاجًا.' },
        { role: 'user', content: String(currentMessage || '') },
      ],
    });
    const content = completion.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;
    try { return JSON.parse(content); } catch { return null; }
  }
}

module.exports = Object.assign(GroqConversationProvider, { MODEL });
