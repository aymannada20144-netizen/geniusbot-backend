'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SemanticCoreCompatibilityProvider = require(
  '../../src/services/shaden/SemanticCoreCompatibilityProvider'
);

const context = Object.freeze({
  contextVersion: 1,
  active: Object.freeze({ goal: 'booking', step: 'awaiting_confirmation' }),
  pending: Object.freeze({ kind: 'confirmation', targetType: 'appointment' }),
});

function core(overrides = {}) {
  return {
    contractVersion: 2, primaryGoal: 'booking', conversationAct: 'accept',
    confidence: 0.95, interpretation: { status: 'clear' },
    mentionedEntities: [], additionalGoals: [], ...overrides,
  };
}

test('compatibility provider maps eligible contextual evidence without execution data', async () => {
  const source = { text: 'نعم', context };
  const before = structuredClone(source);
  const provider = new SemanticCoreCompatibilityProvider({
    semanticCoreProvider: { understand: async () => core() },
  });
  const result = await provider.understand(source);
  assert.equal(result.primaryIntent, 'booking');
  assert.equal(result.conversationAct, 'confirmation');
  assert.equal(result.signals.confirmation, true);
  assert.deepEqual(result.entities.serviceMentions, []);
  assert.equal('action' in result, false);
  assert.deepEqual(source, before);
});

test('compatibility provider creates a bounded event only after acceptance', async () => {
  const provider = new SemanticCoreCompatibilityProvider({
    semanticCoreProvider: { understand: async () => core() },
  });
  const result = await provider.understandWithInteractionEvent({
    text: 'unresolved response', context,
  });
  assert.equal(result.interactionEvent.type, 'ACCEPT_PENDING');
  assert.equal(result.interactionEvent.guard.goal, 'booking');
  assert.equal('action' in result.interactionEvent, false);
});

test('compatibility provider rejects conflicting, incomplete, or invented evidence', async (t) => {
  const cases = [
    core({ primaryGoal: 'appointment_cancel' }),
    core({ interpretation: { status: 'dependent' } }),
    core({ mentionedEntities: [{ type: 'service', surfaceText: 'هذا', conceptText: 'هذا' }] }),
    core({ additionalGoals: ['availability'] }),
  ];
  for (const result of cases) {
    await t.test(JSON.stringify(result), async () => {
      const provider = new SemanticCoreCompatibilityProvider({
        semanticCoreProvider: { understand: async () => result },
      });
      await assert.rejects(provider.understand({ text: 'نعم', context }), /incompatible/u);
    });
  }
});
