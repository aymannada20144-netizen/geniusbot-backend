'use strict';

const Groq = require('groq-sdk');
const {
  SEMANTIC_UNDERSTANDING_JSON_SCHEMA,
} = require('../../contracts/shaden/SemanticUnderstandingResult');

class GroqSemanticModelClient {
  constructor({ client, model } = {}) {
    if (typeof client?.chat?.completions?.create !== 'function') {
      throw new TypeError('GroqSemanticModelClient requires a Groq-compatible client.');
    }
    if (typeof model !== 'string' || !model.trim()) {
      throw new TypeError('GroqSemanticModelClient requires a model name.');
    }
    this.client = client;
    this.model = model.trim();
  }

  async inferUnderstanding({ text } = {}) {
    if (typeof text !== 'string' || !text.trim()) {
      throw new TypeError('Groq semantic inference requires text.');
    }
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'shaden_semantic_understanding',
          strict: true,
          schema: SEMANTIC_UNDERSTANDING_JSON_SCHEMA,
        },
      },
      messages: [
        {
          role: 'system',
          content: SYSTEM_INSTRUCTION,
        },
        {
          role: 'user',
          content: JSON.stringify({ text }),
        },
      ],
    });
    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Groq semantic inference returned no structured content.');
    }
    return content;
  }
}

function createGroqSemanticModelClient({ apiKey, model } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new TypeError('A Groq API key is required.');
  }
  return new GroqSemanticModelClient({
    client: new Groq({ apiKey: apiKey.trim() }),
    model,
  });
}

const SYSTEM_INSTRUCTION = [
  'Classify only the natural-language meaning of the supplied user text.',
  'Return one JSON object matching SemanticUnderstandingResult version 1.',
  'Do not answer, recommend, invent facts or identifiers, choose actions, or execute anything.',
  'Entity text must be copied literally from the supplied text.',
].join(' ');

module.exports = GroqSemanticModelClient;
module.exports.createGroqSemanticModelClient = createGroqSemanticModelClient;
