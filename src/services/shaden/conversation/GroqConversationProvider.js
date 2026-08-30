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
}

module.exports = Object.assign(GroqConversationProvider, { MODEL });
