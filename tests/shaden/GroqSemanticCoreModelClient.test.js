'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const GroqSemanticCoreModelClient = require('../../src/services/shaden/GroqSemanticCoreModelClient');

test('GroqSemanticCoreModelClient exposes only minimal structured inference', async () => {
  const calls = [];
  const client = new GroqSemanticCoreModelClient({
    model: 'configured-model',
    client: {
      chat: {
        completions: {
          async create(input) {
            calls.push(input);
            return { choices: [{ message: { content: '{"contractVersion":2}' } }] };
          },
        },
      },
    },
  });

  assert.equal(
    await client.inferSemanticCore({ text: 'أبي أحجز' }),
    '{"contractVersion":2}'
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].temperature, 0);
  assert.equal(calls[0].response_format.type, 'json_schema');
  assert.equal(calls[0].response_format.json_schema.strict, true);
  assert.deepEqual(
    calls[0].response_format.json_schema.schema.required,
    [
      'contractVersion', 'primaryGoal', 'conversationAct', 'confidence',
      'interpretation', 'mentionedEntities', 'additionalGoals',
    ]
  );
  assert.deepEqual(JSON.parse(calls[0].messages[1].content), {
    text: 'أبي أحجز',
  });
  const payload = JSON.parse(calls[0].messages[1].content);
  assert.deepEqual(Object.keys(payload), ['text']);
  assert.equal('action' in calls[0], false);
  assert.equal('tools' in calls[0], false);
});

test('GroqSemanticCoreModelClient rejects invalid input and empty output', async () => {
  const client = new GroqSemanticCoreModelClient({
    model: 'configured-model',
    client: {
      chat: { completions: { async create() { return { choices: [] }; } } },
    },
  });
  await assert.rejects(client.inferSemanticCore({ text: '' }), TypeError);
  await assert.rejects(
    client.inferSemanticCore({ text: 'مرحبا' }),
    /returned no structured content/u
  );
});

test('GroqSemanticCoreModelClient presents bounded context as structured input', async () => {
  const calls = [];
  const client = new GroqSemanticCoreModelClient({
    model: 'configured-model',
    client: {
      chat: { completions: { async create(input) {
        calls.push(input);
        return { choices: [{ message: { content: '{}' } }] };
      } } },
    },
  });
  await client.inferSemanticCore({
    text: 'نعم',
    context: {
      contextVersion: 1,
      active: { goal: 'booking', step: 'awaiting_confirmation' },
      pending: { kind: 'confirmation', targetType: 'appointment' },
    },
  });
  assert.deepEqual(JSON.parse(calls[0].messages[1].content), {
    text: 'نعم',
    context: {
      contextVersion: 1,
      active: { goal: 'booking', step: 'awaiting_confirmation' },
      pending: { kind: 'confirmation', targetType: 'appointment' },
    },
  });
  assert.doesNotMatch(calls[0].messages[1].content, /history|patient|appointmentId|options/u);
});

test('GroqSemanticCoreModelClient rejects unbounded context before transport', async () => {
  let invoked = false;
  const client = new GroqSemanticCoreModelClient({
    model: 'configured-model',
    client: {
      chat: { completions: { async create() {
        invoked = true;
        return { choices: [] };
      } } },
    },
  });
  await assert.rejects(client.inferSemanticCore({
    text: 'نعم',
    context: {
      contextVersion: 1,
      active: null,
      pending: null,
      history: ['private'],
    },
  }), { code: 'VALIDATION_ERROR' });
  assert.equal(invoked, false);
});

test('Groq semantic core prompt contains conceptual safeguards without catalog data', async () => {
  const calls = [];
  const client = new GroqSemanticCoreModelClient({
    model: 'configured-model',
    client: {
      chat: { completions: { async create(input) {
        calls.push(input);
        return { choices: [{ message: { content: '{}' } }] };
      } } },
    },
  });
  await client.inferSemanticCore({ text: 'رسالة' });
  const instruction = calls[0].messages[0].content;
  assert.match(instruction, /business goal separately from the conversationAct/u);
  assert.match(instruction, /never business goals/u);
  assert.match(instruction, /purely social utterance.*social_engagement/u);
  assert.match(instruction, /primaryGoal must be unknown/u);
  assert.match(instruction, /date or time.*appointment_reschedule/u);
  assert.match(instruction, /non-time appointment attribute/u);
  assert.match(instruction, /elliptical follow-ups/u);
  assert.match(instruction, /act is identifiable but its target or referent is not/u);
  assert.match(instruction, /optional SemanticContext is bounded evidence/u);
  assert.match(instruction, /do not mark it dependent solely/u);
  assert.match(instruction, /Do not treat SemanticContext as another user message/u);
  assert.match(instruction, /correct outranks request/u);
  assert.match(instruction, /user stance, not the pending interaction type/u);
  assert.match(instruction, /do not duplicate selection/u);
  assert.match(instruction, /operational goal that must be handled first/u);
  assert.match(instruction, /prerequisite or condition/u);
  assert.match(instruction, /must not add meaning or specialize/u);
  assert.match(instruction, /Never resolve an entity to a clinic catalog/u);
  assert.match(instruction, /Emit an empty array/u);
  assert.doesNotMatch(instruction, /فيلر|بوتوكس|ليزر|تقشير/u);
});
