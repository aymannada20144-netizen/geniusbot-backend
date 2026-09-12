'use strict';

class OpenRouterSemanticProvider {
  constructor({
    apiKey,
    baseUrl,
    model,
    timeoutMs = 30000,
  } = {}) {
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new TypeError(
        'OpenRouterSemanticProvider requires an API key'
      );
    }

    if (typeof model !== 'string' || !model.trim()) {
      throw new TypeError(
        'OpenRouterSemanticProvider requires a model'
      );
    }

    this.apiKey = apiKey.trim();

    this.baseUrl = String(
      baseUrl || 'https://openrouter.ai/api/v1'
    ).replace(/\/+$/, '');

    this.model = model.trim();
    this.timeoutMs = timeoutMs;
  }

  async completeJson(messages) {
    if (
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      throw new TypeError(
        'OpenRouterSemanticProvider requires messages'
      );
    }

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      this.timeoutMs
    );

    try {
      const response = await fetch(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            model: this.model,
            temperature: 0,
            messages,

            response_format: {
              type: 'json_object',
            },
          }),

          signal: controller.signal,
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body?.error?.message ||
          `OpenRouter semantic request failed with status ${response.status}`
        );
      }

      const content =
        body?.choices?.[0]?.message?.content;

      if (
        typeof content !== 'string' ||
        !content.trim()
      ) {
        throw new Error(
          'OpenRouter semantic response contained no text content.'
        );
      }

      let parsed;

      try {
        parsed = JSON.parse(content);
      } catch (_error) {
        throw new Error(
          'OpenRouter semantic response was not valid JSON.'
        );
      }

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        throw new Error(
          'OpenRouter semantic response must be a JSON object.'
        );
      }

      return Object.freeze({
        result: parsed,
        rawContent: content,
        model: body?.model || this.model,

        usage: Object.freeze({
          promptTokens:
            Number(body?.usage?.prompt_tokens) || 0,

          completionTokens:
            Number(body?.usage?.completion_tokens) || 0,

          totalTokens:
            Number(body?.usage?.total_tokens) || 0,
        }),
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = OpenRouterSemanticProvider;
