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
}

module.exports = OpenRouterConversationProvider;
