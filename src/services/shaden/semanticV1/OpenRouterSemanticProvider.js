'use strict';

class OpenRouterSemanticProvider {
  constructor({
    apiKey,
    baseUrl,
    model,
    timeoutMs = OpenRouterSemanticProvider.DEFAULT_TOTAL_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
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
    this.fetchImpl = fetchImpl;
    this.setTimeoutImpl = setTimeoutImpl;
    this.clearTimeoutImpl = clearTimeoutImpl;
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

    const timer = this.setTimeoutImpl(
      () => controller.abort(),
      this.timeoutMs
    );

    try {
      const firstResponse = await this.requestJson(messages, controller.signal, 0);

      try {
        return parseStructuredOutput(firstResponse);
      } catch (error) {
        if (!isInvalidJson(error)) throw error;

        const retryResponse = await this.requestJson(
          correctiveRetryMessages(messages),
          controller.signal,
          1
        );

        try {
          return parseStructuredOutput(retryResponse);
        } catch (retryError) {
          throw withRetryMetadata(retryError, 1);
        }
      }
    } finally {
      this.clearTimeoutImpl(timer);
    }
  }

  async requestJson(messages, signal, retryCount) {
    let response;
    try {
      response = await this.fetchImpl(
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

          signal,
        }
      );
    } catch (error) {
      if (signal?.aborted) {
        throw new StructuredSemanticOutputError(
          'OpenRouter semantic response exceeded the total deadline.',
          deadlineMetadata(this.model, retryCount)
        );
      }
      throw error;
    }

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body?.error?.message ||
          `OpenRouter semantic request failed with status ${response.status}`
        );
      }

    const choice = body?.choices?.[0];
    const metadata = Object.freeze({
      model: body?.model || this.model,
      finishReason: choice?.finish_reason || null,
      contentLength: typeof choice?.message?.content === 'string'
        ? choice.message.content.length : 0,
      parseStage: 'provider_content',
      retryCount,
    });

    const content = choice?.message?.content;

      if (
        typeof content !== 'string' ||
        !content.trim()
      ) {
      throw new StructuredSemanticOutputError(
        'OpenRouter semantic response contained no text content.', metadata
      );
      }

    return Object.freeze({
      content,
      metadata,
      usage: Object.freeze({
        promptTokens: Number(body?.usage?.prompt_tokens) || 0,
        completionTokens: Number(body?.usage?.completion_tokens) || 0,
        totalTokens: Number(body?.usage?.total_tokens) || 0,
      }),
    });
  }
}

OpenRouterSemanticProvider.DEFAULT_TOTAL_TIMEOUT_MS = 30000;

class StructuredSemanticOutputError extends Error {
  constructor(message, metadata) {
    super(message);
    this.name = 'StructuredSemanticOutputError';
    this.metadata = Object.freeze({ ...metadata });
  }
}

function parseStructuredOutput(response) {
  const metadata = { ...response.metadata };
  let result;
  try {
    result = JSON.parse(response.content);
  } catch {
    throw new StructuredSemanticOutputError(
      'OpenRouter semantic response was not valid JSON.',
      { ...metadata, parseStage: 'json_parse' }
    );
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new StructuredSemanticOutputError(
      'OpenRouter semantic response must be a JSON object.',
      { ...metadata, parseStage: 'json_shape' }
    );
  }
  return Object.freeze({
    result,
    rawContent: response.content,
    model: metadata.model,
    usage: response.usage,
    metadata: Object.freeze({ ...metadata, parseStage: 'complete' }),
  });
}

function deadlineMetadata(model, retryCount) {
  return {
    model,
    finishReason: null,
    contentLength: 0,
    parseStage: 'deadline_exhausted',
    retryCount,
  };
}

function correctiveRetryMessages(messages) {
  return [...messages, {
    role: 'system',
    content: 'Your previous response was not valid JSON. Return exactly one complete JSON object with no markdown fences or prose.',
  }];
}

function isInvalidJson(error) {
  return error instanceof StructuredSemanticOutputError &&
    error.metadata.parseStage === 'json_parse';
}

function withRetryMetadata(error, retryCount) {
  if (!(error instanceof StructuredSemanticOutputError)) return error;
  return new StructuredSemanticOutputError(error.message, {
    ...error.metadata,
    retryCount,
  });
}

module.exports = OpenRouterSemanticProvider;
module.exports.StructuredSemanticOutputError = StructuredSemanticOutputError;
