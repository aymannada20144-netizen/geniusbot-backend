'use strict';

class OpenRouterEmbeddingProvider {
  constructor({
    apiKey,
    baseUrl =
      'https://openrouter.ai/api/v1',
    model =
      'openai/text-embedding-3-small',
    timeoutMs = 30000,
  } = {}) {
    if (
      typeof apiKey !== 'string' ||
      !apiKey.trim()
    ) {
      throw new TypeError(
        'OpenRouterEmbeddingProvider requires an API key.'
      );
    }

    this.apiKey = apiKey.trim();

    this.baseUrl =
      String(baseUrl)
        .replace(/\/+$/, '');

    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async embed(inputs) {
    if (
      !Array.isArray(inputs) ||
      inputs.length === 0 ||
      inputs.some(
        (item) =>
          typeof item !== 'string' ||
          !item.trim()
      )
    ) {
      throw new TypeError(
        'embed requires non-empty strings.'
      );
    }

    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () => controller.abort(),
        this.timeoutMs
      );

    try {
      const response =
        await fetch(
          `${this.baseUrl}/embeddings`,
          {
            method: 'POST',

            headers: {
              Authorization:
                `Bearer ${this.apiKey}`,

              'Content-Type':
                'application/json',
            },

            signal:
              controller.signal,

            body: JSON.stringify({
              model:
                this.model,

              input:
                inputs,

              encoding_format:
                'float',
            }),
          }
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          `Embedding request failed: ${JSON.stringify(body)}`
        );
      }

      const vectors =
        [...body.data]
          .sort(
            (a, b) =>
              a.index - b.index
          )
          .map(
            (item) =>
              item.embedding
          );

      if (
        vectors.length !== inputs.length
      ) {
        throw new Error(
          'Embedding response length mismatch.'
        );
      }

      return Object.freeze({
        vectors:
          Object.freeze(vectors),

        model:
          body.model ||
          this.model,

        usage:
          body.usage || null,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports =
  OpenRouterEmbeddingProvider;
