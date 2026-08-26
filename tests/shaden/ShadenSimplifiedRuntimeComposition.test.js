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
  assert.match(source, /route: 'DETERMINISTIC'/);
  assert.doesNotMatch(
    source,
    /GroqUnified|SemanticCore|SemanticUnderstanding|ServiceInquiry|ConversationalIntelligence/
  );
  assert.doesNotMatch(source, /unifiedConversationalOrchestratorEnabled/);
});
