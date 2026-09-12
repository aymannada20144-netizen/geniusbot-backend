'use strict';

const {
  buildSemanticMessages,
} = require('./SemanticPromptV1');

const {
  validateSemanticResult,
  SemanticContractViolationError,
} = require('./SemanticResultValidator');

class SemanticInterpreterV1 {
  constructor({ provider } = {}) {
    if (
      !provider ||
      typeof provider.completeJson !== 'function'
    ) {
      throw new TypeError(
        'SemanticInterpreterV1 requires a semantic provider'
      );
    }

    this.provider = provider;
  }

  async interpret({
    currentMessage,
    contextTurns = [],
  } = {}) {
    const messages = buildSemanticMessages({
      currentMessage,
      contextTurns,
    });

    const response =
      await this.provider.completeJson(messages);

    let contractValid = true;
    let contractError = null;

    let result = response.result;
    try {
      result = validateSemanticResult(
        response.result,
        {
          currentMessage,
          contextTurns,
        }
      );
    } catch (error) {
      if (
        error instanceof
        SemanticContractViolationError
      ) {
        contractValid = false;

        contractError = Object.freeze({
          name: error.name,
          message: error.message,
        });
      } else {
        throw error;
      }
    }

    return Object.freeze({
      result,
      contractValid,
      contractError,
      model: response.model,
      usage: response.usage,
      rawContent: response.rawContent,
    });
  }
}

module.exports = SemanticInterpreterV1;
