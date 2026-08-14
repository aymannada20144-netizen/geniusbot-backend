'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ShadenConversationalIntelligenceOrchestrator =
  require('../../src/services/shaden/ShadenConversationalIntelligenceOrchestrator');

const DeterministicUnderstandingProvider =
  require('../../src/services/shaden/DeterministicUnderstandingProvider');

const DeterministicDialogueDecisionProvider =
  require('../../src/services/shaden/DeterministicDialogueDecisionProvider');

function createRuntime() {
  return new ShadenConversationalIntelligenceOrchestrator({
    understandingProvider:
      new DeterministicUnderstandingProvider(),

    decisionProvider:
      new DeterministicDialogueDecisionProvider(),
  });
}

test('Shaden conversational intelligence shadow evaluation', async (t) => {
  await t.test('booking intent produces START_BOOKING in shadow only', async () => {
    const runtime = createRuntime();

    const result = await runtime.analyze({
      message: 'أبغى أحجز ليزر',
    });

    assert.equal(
      result.understanding.primaryIntent,
      'booking'
    );

    assert.equal(
      result.decision.action,
      'START_BOOKING'
    );

    assert.equal(result.affectsRuntime, false);
    assert.equal(result.executable, false);
  });

  await t.test('medical risk overrides booking end to end', async () => {
    const runtime = createRuntime();

    const result = await runtime.analyze({
      message: 'أبغى أحجز ليزر بس عندي ضيق تنفس',
    });

    assert.equal(
      result.understanding.primaryIntent,
      'booking'
    );

    assert.equal(
      result.understanding.signals.medicalRisk,
      true
    );

    assert.equal(
      result.decision.action,
      'ESCALATE'
    );

    assert.equal(
      result.decision.goal,
      'handover_to_human'
    );

    assert.equal(result.decision.executable, false);
  });

  await t.test('hesitation overrides booking with reassurance', async () => {
    const runtime = createRuntime();

    const result = await runtime.analyze({
      message: 'أبغى أحجز ليزر بس والله مترددة شوي',
    });

    assert.equal(
      result.understanding.primaryIntent,
      'booking'
    );

    assert.equal(
      result.understanding.signals.hesitation,
      true
    );

    assert.equal(
      result.decision.action,
      'REASSURE'
    );

    assert.equal(
      result.decision.flags.preserveCurrentFlow,
      true
    );
  });

  await t.test('complaint overrides appointment query', async () => {
    const runtime = createRuntime();

    const result = await runtime.analyze({
      message: 'وين موعدي؟ وبصراحة انتظرت كثير وما أحد رد',
    });

    assert.equal(
      result.understanding.signals.complaint,
      true
    );

    assert.equal(
      result.decision.action,
      'APOLOGIZE'
    );

    assert.equal(
      result.decision.goal,
      'resolve_complaint'
    );
  });

  await t.test('explicit human request escalates without execution', async () => {
    const runtime = createRuntime();

    const result = await runtime.analyze({
      message: 'أبغى أكلم موظفة',
    });

    assert.equal(
      result.understanding.signals.humanHandover,
      true
    );

    assert.equal(
      result.decision.action,
      'ESCALATE'
    );

    assert.equal(
      result.decision.flags.requiresHuman,
      true
    );

    assert.equal(result.executable, false);
  });

  await t.test('legal escalation outranks ordinary complaint handling', async () => {
    const runtime = createRuntime();

    const result = await runtime.analyze({
      message: 'الخدمة سيئة وبشتكي عليكم',
    });

    assert.equal(
      result.understanding.signals.complaint,
      true
    );

    assert.equal(
      result.understanding.signals.legalEscalation,
      true
    );

    assert.equal(
      result.decision.action,
      'ESCALATE'
    );
  });

  await t.test('ordinary objection does not become human escalation', async () => {
    const runtime = createRuntime();

    const result = await runtime.analyze({
      message: 'السعر غالي وما يناسبني',
    });

    assert.equal(
      result.understanding.signals.objection,
      true
    );

    assert.equal(
      result.decision.action,
      'HANDLE_OBJECTION'
    );

    assert.equal(
      result.decision.flags.requiresHuman,
      false
    );
  });

  await t.test('unknown input remains safely non executable', async () => {
    const runtime = createRuntime();

    const result = await runtime.analyze({
      message: 'كلام غير واضح تماما',
    });

    assert.equal(
      result.decision.executable,
      false
    );

    assert.equal(result.affectsRuntime, false);
    assert.equal(result.affectsReply, false);
    assert.equal(result.affectsState, false);
  });
});