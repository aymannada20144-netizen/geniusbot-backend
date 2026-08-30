'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('composition installs debounce on the deterministic Shaden runtime', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../src/app.js'), 'utf8'
  );
  assert.match(source, /new WhatsAppMessageDebouncer\(\{/);
  assert.match(source, /conversationLayerEnabled: env\.conversation\.enabled/);
  assert.match(source, /new KnowledgeService\(/);
  assert.match(source, /knowledgeService,/);
  assert.match(source, /: 'DETERMINISTIC'/);
  assert.match(source, /LLM_CONVERSATION_WITH_OPERATIONAL_CORE/);
  assert.doesNotMatch(source, /unifiedConversationalOrchestratorEnabled/);
});
