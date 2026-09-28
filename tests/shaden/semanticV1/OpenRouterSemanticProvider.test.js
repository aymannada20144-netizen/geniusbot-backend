'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const OpenRouterSemanticProvider = require(
  '../../../src/services/shaden/semanticV1/OpenRouterSemanticProvider'
);
const SemanticInterpreterV1 = require(
  '../../../src/services/shaden/semanticV1/SemanticInterpreterV1'
);

test('accepts one plain JSON object and requests structured output', async () => {
  const calls = [];
  const provider = subject([jsonResponse(validResult())], calls);
  const result = await provider.completeJson(messages());
  assert.deepEqual(result.result, validResult());
  assert.equal(result.metadata.parseStage, 'complete');
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].body).response_format, { type: 'json_object' });
});

test('code-fenced JSON is not extracted from free text and succeeds only through one corrective retry', async () => {
  const calls = [];
  const provider = subject([
    jsonResponse('```json\n{}\n```'),
    jsonResponse(validResult()),
  ], calls);
  const result = await provider.completeJson(messages());
  assert.deepEqual(result.result, validResult());
  assert.equal(result.metadata.retryCount, 1);
  assert.equal(calls.length, 2);
  assert.match(JSON.parse(calls[1].body).messages.at(-1).content, /exactly one complete JSON object/u);
});

test('truncated JSON fails after exactly one retry with safe parse metadata', async () => {
  const calls = [];
  const provider = subject([jsonResponse('{'), jsonResponse('{')], calls);
  await assert.rejects(provider.completeJson(messages()), (error) => {
    assert.equal(error.metadata.parseStage, 'json_parse');
    assert.equal(error.metadata.retryCount, 1);
    assert.equal(error.metadata.contentLength, 1);
    return true;
  });
  assert.equal(calls.length, 2);
});

test('one total deadline covers an invalid first response and a hanging retry without real sleep', async () => {
  let deadline = null;
  let timerCount = 0;
  let calls = 0;
  const provider = new OpenRouterSemanticProvider({
    apiKey: 'test-key', model: 'semantic-test', timeoutMs: 123,
    setTimeoutImpl(callback, timeoutMs) {
      timerCount += 1;
      assert.equal(timeoutMs, 123);
      deadline = callback;
      return 'timer';
    },
    clearTimeoutImpl() {},
    fetchImpl: async (_url, options) => {
      calls += 1;
      if (calls === 1) return jsonResponse('{');
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    },
  });
  const completion = provider.completeJson(messages());
  for (let index = 0; index < 20 && calls < 2; index += 1) await Promise.resolve();
  assert.equal(calls, 2);
  assert.equal(timerCount, 1);
  deadline();
  await assert.rejects(completion, (error) => {
    assert.equal(error.metadata.parseStage, 'deadline_exhausted');
    assert.equal(error.metadata.retryCount, 1);
    return true;
  });
});

test('prose before JSON is rejected rather than extracting arbitrary JSON, then retry can succeed', async () => {
  const provider = subject([
    jsonResponse('Here is the result: {}'),
    jsonResponse(validResult()),
  ]);
  const result = await provider.completeJson(messages());
  assert.deepEqual(result.result, validResult());
  assert.equal(result.metadata.retryCount, 1);
});

test('semantic schema failure is distinct from JSON parsing and does not retry', async () => {
  let calls = 0;
  const interpreter = new SemanticInterpreterV1({ provider: {
    async completeJson() {
      calls += 1;
      return { result: {}, model: 'semantic-test', usage: {}, metadata: {} };
    },
  } });
  const result = await interpreter.interpret({ currentMessage: 'x' });
  assert.equal(result.contractValid, false);
  assert.equal(calls, 1);
});

function subject(responses, calls = []) {
  return new OpenRouterSemanticProvider({
    apiKey: 'test-key', model: 'semantic-test',
    fetchImpl: async (_url, options) => {
      calls.push(options);
      return responses.shift();
    },
  });
}

function messages() {
  return [{ role: 'user', content: 'test input' }];
}

function validResult() {
  return { status: 'UNKNOWN', goal: null, subjects: [], constraints: [] };
}

function jsonResponse(content) {
  const resolvedContent = typeof content === 'string' ? content : JSON.stringify(content);
  return {
    ok: true,
    async json() {
      return {
        model: 'semantic-test',
        choices: [{ message: { content: resolvedContent }, finish_reason: 'stop' }],
      };
    },
  };
}
