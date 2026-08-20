'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ClinicDomainEntityResolver,
} = require('../../src/services/shaden/ClinicDomainEntityResolver');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');
const DeterministicUnderstandingProvider = require(
  '../../src/services/shaden/DeterministicUnderstandingProvider'
);
const HybridUnderstandingProvider = require(
  '../../src/services/shaden/HybridUnderstandingProvider'
);
const DeterministicDialogueDecisionProvider = require(
  '../../src/services/shaden/DeterministicDialogueDecisionProvider'
);
const ShadenConversationalIntelligenceOrchestrator = require(
  '../../src/services/shaden/ShadenConversationalIntelligenceOrchestrator'
);

const IDS = Object.freeze({
  laser: 'service-laser', laserSpecialty: 'specialty-laser',
  dermatologySpecialty: 'specialty-dermatology',
  consultation: 'service-consultation',
  hamdaniya: 'branch-hamdaniya',
  salihiya: 'branch-salihiya',
});

function resolver() {
  return new ClinicDomainEntityResolver({
    catalogService: {
      async list(resource) {
        if (resource === 'services') return [
          {
            id: IDS.laser, name: 'إزالة الشعر بالليزر',
            aliases: ['خدمات الليزر الطبية والتجميلية'],
            specialty_id: IDS.laserSpecialty,
            is_active: true, is_booking_enabled: true,
          },
          {
            id: 'service-cleaning', name: 'تنظيف البشرة', aliases: [],
            is_active: true, is_booking_enabled: true,
          },
          {
            id: IDS.consultation, name: 'استشارة جلدية', aliases: ['جلدية'],
            specialty_id: IDS.dermatologySpecialty,
            is_active: true, is_booking_enabled: true,
          },
        ];
        if (resource === 'specialties') return [
          { id: IDS.laserSpecialty, name: 'ليزر', is_active: true },
          { id: IDS.dermatologySpecialty, name: 'جلدية', is_active: true },
        ];
        if (resource === 'branches') return [
          { id: IDS.hamdaniya, name: 'فرع الحمدانية', city: 'جدة', is_active: true },
          { id: IDS.salihiya, name: 'فرع الصالحية', city: 'جدة', is_active: true },
        ];
        return [];
      },
    },
  });
}

test('resolves independent service and branch proposals', async (t) => {
  for (const [branchText, branchId] of [
    ['فرع الحمدانية', IDS.hamdaniya],
    ['فرع الصالحية', IDS.salihiya],
  ]) {
    await t.test(branchText, async () => {
      const result = await resolver().resolve('clinic-1', {
        serviceText: 'إزالة الشعر بالليزر', branchText,
      });
      assert.equal(result.resolution.service.status, 'RESOLVED');
      assert.equal(result.resolution.service.id, IDS.laser);
      assert.equal(result.resolution.branch.status, 'RESOLVED');
      assert.equal(result.resolution.branch.id, branchId);
      assert.equal(result.constraints.serviceId, IDS.laser);
      assert.equal(result.constraints.branchId, branchId);
    });
  }
});

test('competing candidates remain explicitly ambiguous', async () => {
  const result = await resolver().resolve('clinic-1', {
    serviceCandidates: ['إزالة الشعر بالليزر', 'حقن البوتوكس'],
  });
  assert.equal(result.resolution.service.status, 'AMBIGUOUS');
  assert.deepEqual(result.resolution.service.proposals, [
    'إزالة الشعر بالليزر', 'حقن البوتوكس',
  ]);
  assert.equal(result.constraints.serviceId, null);
});

test('catalog and semantic identity conflict remains ambiguous', async () => {
  const result = await resolver().resolve('clinic-1', {
    serviceText: 'تنظيف البشرة',
  }, { text: 'هل تقدمون إزالة الشعر بالليزر' });
  assert.equal(result.resolution.service.status, 'AMBIGUOUS');
  assert.equal(result.constraints.serviceId, null);
});

test('parent specialty suppresses a colliding child-service alias', async () => {
  const result = await resolver().resolve('clinic-1', {
    specialtyText: 'الجلديه في الحمدانيه',
  }, { text: 'ما خدمات الجلدية فى الحمدانية' });
  assert.equal(result.resolution.specialty.status, 'RESOLVED');
  assert.equal(result.resolution.specialty.id, IDS.dermatologySpecialty);
  assert.equal(result.resolution.service.status, 'UNRESOLVED');
  assert.equal(result.resolution.branch.status, 'RESOLVED');
  assert.equal(result.constraints.specialtyId, IDS.dermatologySpecialty);
  assert.equal(result.constraints.serviceId, null);
  assert.equal(result.constraints.branchId, IDS.hamdaniya);
});

test('full child-service identity remains a service', async () => {
  const result = await resolver().resolve('clinic-1', {}, {
    text: 'هل تقدمون استشارة جلدية',
  });
  assert.equal(result.resolution.service.status, 'RESOLVED');
  assert.equal(result.resolution.service.id, IDS.consultation);
  assert.equal(result.resolution.specialty.status, 'UNRESOLVED');
  assert.equal(result.constraints.serviceId, IDS.consultation);
  assert.equal(result.constraints.specialtyId, null);
});

test('real compound messages reach resolution as independent proposals', async (t) => {
  for (const [text, branchName, branchId] of [
    ['ما خدمات الليزر فى فرع الحمدانية', 'فرع الحمدانية', IDS.hamdaniya],
    ['ما خدمات الليزر فى فرع الصالحية', 'فرع الصالحية', IDS.salihiya],
  ]) {
    await t.test(text, async () => {
      const orchestrator = new ShadenConversationalIntelligenceOrchestrator({
        understandingProvider: new HybridUnderstandingProvider({
          deterministicProvider: new DeterministicUnderstandingProvider({
            policy: new ShadenPolicy(),
          }),
          semanticProvider: {
            async understand() {
              return semanticUnderstanding({ branchName });
            },
          },
        }),
        decisionProvider: new DeterministicDialogueDecisionProvider(),
      });
      const analyzed = await orchestrator.analyze({ message: text });
      const proposals = analyzed.decision.proposedDomainConstraints;
      const resolved = await resolver().resolve('clinic-1', proposals, { text });
      assert.equal(proposals.serviceText, 'الليزر');
      assert.equal(proposals.branchText, branchName);
      assert.match(proposals.specialtyText, /^الليزر في فرع /u);
      assert.equal(resolved.resolution.service.status, 'UNRESOLVED');
      assert.equal(resolved.resolution.specialty.status, 'RESOLVED');
      assert.equal(resolved.resolution.specialty.id, IDS.laserSpecialty);
      assert.equal(resolved.constraints.specialtyId, IDS.laserSpecialty);
      assert.equal(resolved.constraints.serviceId, null);
      assert.equal(resolved.resolution.branch.status, 'RESOLVED');
      assert.equal(resolved.resolution.branch.id, branchId);
    });
  }
});

function semanticUnderstanding({ branchName }) {
  const signalNames = [
    'confirmation', 'rejection', 'correction', 'interruption', 'conditional',
    'hesitation', 'objection', 'complaint', 'medicalQuestion', 'medicalRisk',
    'humanHandover', 'legalEscalation', 'botFrustration', 'abuseOrThreat',
  ];
  return {
    version: 1, conversationAct: 'question', primaryIntent: 'services',
    knowledgeTopic: null, secondaryIntents: [],
    entities: {
      serviceMentions: [{
        text: 'الليزر', concept: 'الليزر',
        role: 'requested', confidence: 0.99,
      }],
      branchMentions: [{
        text: branchName.replace(/^فرع /u, ''), concept: branchName,
        role: 'requested', confidence: 0.99,
      }],
      providerMentions: [], dateTimeMentions: [], bookingReference: null,
      appointmentManagementTarget: 'unspecified', corrections: [],
    },
    signals: Object.fromEntries(signalNames.map((name) => [name, false])),
    sentiment: 'neutral', confidence: 0.99,
    ambiguity: {
      requiresClarification: false, reason: 'none', candidateIntents: [],
      ambiguousEntityTypes: [],
    },
  };
}
