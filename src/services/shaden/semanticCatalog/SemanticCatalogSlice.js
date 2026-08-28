'use strict';

const { groundReference } = require('./AuthoritativeCatalogGrounder');

const ELIGIBLE_DETERMINISTIC_TYPES = new Set(['unknown', 'service_exists', 'services_under_specialty']);
const ACTIVE_STATE_KEYS = Object.freeze([
  'booking', 'cancellation', 'reschedule', 'changeService', 'changeBranch', 'priceInquiry',
]);

class SemanticCatalogSlice {
  constructor({ provider, knowledgeService = null } = {}) {
    if (typeof provider?.understand !== 'function') throw new TypeError('SemanticCatalogSlice requires provider.understand()');
    this.provider = provider;
    this.knowledgeService = knowledgeService;
  }
  eligibility({ message, currentState, deterministicInquiry }) {
    if (message?.inputProvenance?.trusted === true) return no('TRUSTED_INTERACTIVE');
    if (hasActiveState(currentState)) return no('ACTIVE_DETERMINISTIC_STATE');
    if (!ELIGIBLE_DETERMINISTIC_TYPES.has(deterministicInquiry?.type)) return no('CONCLUSIVE_DETERMINISTIC_ROUTE');
    return { eligible: true, reason: null };
  }
  async evaluate({ message, currentState, deterministicInquiry, catalog, clinicId = null }) {
    const eligibility = this.eligibility({ message, currentState, deterministicInquiry });
    if (!eligibility.eligible) return { ...eligibility, llmCalled: false, ownership: 'NOT_OWNED' };
    const provider = await this.provider.understand(message.text);
    if (provider.status !== 'OK') return {
      ...eligibility, llmCalled: true, provider, semantic: provider.meaning,
      grounding: [], ownership: 'NOT_OWNED', finalResponseClassification: 'PROVIDER_FAILURE_BASELINE_FALLBACK',
    };
    const semantic = provider.meaning;
    if (!semantic.answerNeeded) return {
      ...eligibility, llmCalled: true, provider, semantic, grounding: [],
      ownership: 'NOT_OWNED', finalResponseClassification: 'ANSWER_NOT_NEEDED',
    };
    const grounding = await Promise.all(semantic.references.map(async (
      reference, referenceIndex
    ) => ({
      referenceIndex,
      reference,
      ...(reference.kind === 'DESCRIBED_NEED'
        ? await groundDescribedNeed({
          reference, catalog, clinicId,
          knowledgeService: this.knowledgeService,
        })
        : groundReference(reference, catalog)),
    })));
    return { ...eligibility, llmCalled: true, provider, semantic, grounding, ...interpret({ grounding, catalog }) };
  }
}

async function groundDescribedNeed({
  reference, catalog, clinicId, knowledgeService,
}) {
  if (!clinicId || typeof knowledgeService?.retrieveDescribedNeed !== 'function') {
    return knowledgeGrounding('NOT_FOUND', [], null, 'KNOWLEDGE_NOT_WIRED');
  }
  const knowledge = await knowledgeService.retrieveDescribedNeed({
    clinicId,
    concept: reference.concept,
    qualifiers: reference.qualifiers,
  });
  if (knowledge.status !== 'found') {
    return knowledgeGrounding(
      'NOT_FOUND', [], knowledge,
      knowledge.status === 'unavailable' ? 'KNOWLEDGE_UNAVAILABLE' : 'NO_KNOWLEDGE_MATCH'
    );
  }
  const candidates = knowledge.references.flatMap((referenceItem, index) => {
    const service = catalog.services.find((item) =>
      String(item.id) === String(referenceItem.serviceId)
    );
    return service ? [{
      entityType: 'SERVICE',
      authoritativeEntityId: service.id,
      authoritativeEntityName: service.name,
      matchedField: 'knowledge_base',
      matchedText: knowledge.facts[index] || null,
      evidenceKind: 'KNOWLEDGE',
      evidenceStrength: 'CLINIC_AUTHORED_KNOWLEDGE',
      evidenceTier: 0,
      matchMethod: 'DETERMINISTIC_TEXTUAL_MATCH',
      normalizationMethod: 'EXACT_MACHINE_TAG',
      inputSource: 'boundedConcept',
      knowledgeReferenceId: referenceItem.id,
    }] : [];
  });
  const unique = [...new Map(candidates.map((item) => [
    String(item.authoritativeEntityId), item,
  ])).values()];
  return knowledgeGrounding(
    unique.length === 0 ? 'NOT_FOUND' : unique.length === 1 ? 'RESOLVED' : 'AMBIGUOUS',
    unique,
    knowledge,
    unique.length === 0 ? 'LINKED_SERVICE_INACTIVE_OR_MISSING' : 'VALIDATED_ACTIVE_SERVICE'
  );
}

function knowledgeGrounding(status, candidates, knowledge, reason) {
  return {
    status,
    resolution: status === 'RESOLVED' ? candidates[0] : null,
    candidates,
    interpretedMeaningUsed: [],
    searchedEvidenceClasses: ['knowledge_base'],
    selection: {
      strongestEvidenceTier: candidates.length ? 0 : null,
      strongestEvidenceStrength: candidates.length
        ? 'CLINIC_AUTHORED_KNOWLEDGE' : null,
      discardedWeakerCandidateCount: 0,
      reason,
    },
    knowledge: knowledge ? {
      status: knowledge.status,
      candidateCount: knowledge.references.length,
      linkedServiceIds: knowledge.references
        .map((item) => item.serviceId).filter(Boolean),
      warnings: knowledge.warnings,
    } : {
      status: 'skipped', candidateCount: 0,
      linkedServiceIds: [], warnings: [reason],
    },
  };
}

function interpret({ grounding, catalog }) {
  if (!grounding.length || grounding.some((item) => item.status === 'NOT_FOUND')) {
    const unsupportedNeeds = grounding.filter((item) =>
      item.reference.kind === 'DESCRIBED_NEED' && item.status === 'NOT_FOUND'
    ).map((item) => item.referenceIndex);
    return {
      ownership: 'CLARIFICATION',
      authoritativeDomainQuery: unsupportedNeeds.length
        ? 'AUTHORITATIVE_NEED_TO_OFFERING_EVIDENCE' : 'CATALOG_EVIDENCE',
      authoritativeDomainResult: { supported: false, unsupportedNeedReferenceIndexes: unsupportedNeeds },
      reply: unsupportedNeeds.length
        ? 'لا توجد في بيانات العيادة الحالية معلومات كافية لربط هذا الاحتياج بخدمة محددة. ممكن توضحين اسم خدمة أو تخصص؟ 🌸'
        : 'لم أجد في بيانات العيادة الحالية ما يطابق المقصود بدقة. ممكن توضحين اسم الخدمة أو التخصص؟ 🌸',
      finalResponseClassification: unsupportedNeeds.length
        ? 'DESCRIBED_NEED_UNSUPPORTED' : 'CATALOG_NOT_FOUND_CLARIFICATION',
    };
  }
  if (grounding.some((item) => item.status === 'AMBIGUOUS')) {
    const names = unique(grounding.flatMap((item) => item.status === 'AMBIGUOUS'
      ? item.candidates.map((candidate) => candidate.authoritativeEntityName) : []));
    return {
      ownership: 'CLARIFICATION', authoritativeDomainQuery: 'CATALOG_AMBIGUITY',
      authoritativeDomainResult: { supported: true, candidates: names },
      reply: `المقصود يحتمل أكثر من خيار مسجل: ${names.join('، ')}. أي خيار تقصدين؟ 🌸`,
      finalResponseClassification: 'CATALOG_AMBIGUITY_CLARIFICATION',
    };
  }
  const qualifications = grounding.filter((item) =>
    item.reference.atLocationReferenceIndex !== null
  ).map((item) => evaluateLocationQualification(item, grounding, catalog));
  if (qualifications.length) return locationQualifiedResult(qualifications);
  const resolved = grounding.map((item) => item.resolution);
  return {
    ownership: 'OWNED', authoritativeDomainQuery: 'ACTIVE_CATALOG_IDENTITY',
    authoritativeDomainResult: { supported: true, identities: resolved },
    reply: `نعم، المسجل لدينا حاليًا: ${displayNames(resolved)}. 🌸`,
    finalResponseClassification: 'AUTHORITATIVE_CATALOG_PRESENT',
  };
}

function evaluateLocationQualification(subject, grounding, catalog) {
  const locationIndex = subject.reference.atLocationReferenceIndex;
  const location = grounding[locationIndex];
  if (!location || location.reference.kind !== 'LOCATION_REFERENCE' || location.status !== 'RESOLVED') {
    throw new TypeError('validated location qualification is not grounded');
  }
  const identity = subject.resolution;
  const services = identity.entityType === 'SPECIALTY'
    ? catalog.services.filter((service) => String(service.specialtyId) === String(identity.authoritativeEntityId))
    : catalog.services.filter((service) => String(service.id) === String(identity.authoritativeEntityId));
  const assignedServiceIds = new Set(catalog.serviceBranchAssignments
    .filter((pair) => String(pair.branchId) === String(location.resolution.authoritativeEntityId))
    .map((pair) => String(pair.serviceId)));
  const matchingServices = services.filter((service) => assignedServiceIds.has(String(service.id)))
    .map((service) => ({ id: service.id, name: service.name }));
  return {
    subjectReferenceIndex: subject.referenceIndex, locationReferenceIndex: locationIndex,
    subject: identity, location: location.resolution,
    matchCardinality: cardinality(matchingServices.length), matchingServices,
  };
}

function locationQualifiedResult(qualifications) {
  const supported = qualifications.every((item) => item.matchingServices.length > 0);
  const services = unique(qualifications.flatMap((item) => item.matchingServices.map((service) => service.name)));
  const subjects = unique(qualifications.map((item) => item.subject.authoritativeEntityName));
  const branches = unique(qualifications.map((item) => item.location.authoritativeEntityName));
  return {
    ownership: 'OWNED', authoritativeDomainQuery: 'ACTIVE_SERVICE_BRANCH_ASSIGNMENTS',
    authoritativeDomainResult: { supported, qualifications },
    reply: supported
      ? `نعم، المتوفر من ${subjects.join('، ')} في ${branches.join('، ')}: ${services.join('، ')}. 🌸`
      : `حسب بيانات العيادة الحالية، ${subjects.join('، ')} غير مسجل في ${branches.join('، ')}. 🌸`,
    finalResponseClassification: supported
      ? 'AUTHORITATIVE_RELATIONSHIP_PRESENT' : 'AUTHORITATIVE_RELATIONSHIP_ABSENT',
  };
}

function hasActiveState(state) {
  if (!state || typeof state !== 'object') return false;
  return ACTIVE_STATE_KEYS.some((key) => state[key]) || state.step === 'customer_name' || Boolean(state.context);
}
function no(reason) { return { eligible: false, reason }; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function displayNames(values) { return unique(values.map((item) => item.authoritativeEntityName)).join('، '); }
function cardinality(count) { return count === 0 ? 'ZERO' : count === 1 ? 'ONE' : 'MULTIPLE'; }

module.exports = Object.assign(SemanticCatalogSlice, {
  ACTIVE_STATE_KEYS, ELIGIBLE_DETERMINISTIC_TYPES, hasActiveState,
  interpret, evaluateLocationQualification,
});
