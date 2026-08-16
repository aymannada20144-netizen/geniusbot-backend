'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const GroqSemanticModelClient = require('../../src/services/shaden/GroqSemanticModelClient');

test('GroqSemanticModelClient exposes only narrow structured inference', async () => {
  const calls = [];
  const adapter = new GroqSemanticModelClient({
    model: 'test-model',
    client: {
      chat: { completions: { async create(request) {
        calls.push(request);
        return { choices: [{ message: { content: '{"version":1}' } }] };
      } } },
    },
  });
  const result = await adapter.inferUnderstanding({ text: 'عجبني اسمك' });
  assert.equal(result, '{"version":1}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].temperature, 0);
  assert.equal(calls[0].reasoning_effort, 'low');
  assert.equal(calls[0].max_completion_tokens, 900);
  assert.equal(calls[0].response_format.type, 'json_schema');
  assert.equal(calls[0].response_format.json_schema.strict, true);
  assert.equal(calls[0].response_format.json_schema.schema.additionalProperties, false);
  const candidateSchema = calls[0].response_format.json_schema.schema
    .properties.ambiguity.properties.candidateIntents.items;
  assert.equal(candidateSchema.enum.includes('unknown'), false);
  assert.deepEqual(JSON.parse(calls[0].messages[1].content), { text: 'عجبني اسمك' });
  assert.equal('state' in JSON.parse(calls[0].messages[1].content), false);
});
