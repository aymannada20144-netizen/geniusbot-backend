'use strict';

const DECISIONS = Object.freeze({
  ROUTE_TO_DOMAIN_QUERY: 'ROUTE_TO_DOMAIN_QUERY',
  CLARIFY: 'CLARIFY',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
});
const MIGRATED_TARGETS = new Set(['services', 'branches']);
const ENTITY_TYPES = Object.freeze(['specialty', 'service', 'branch', 'city']);

class FactualQueryPolicy {
  decide({ dialogAct = null, inquiryTarget = null, proposals = {}, resolution = null } = {}) {
    if (!MIGRATED_TARGETS.has(inquiryTarget)) {
      return decision(DECISIONS.OUT_OF_SCOPE, 'CAPABILITY_NOT_MIGRATED', {
        dialogAct, inquiryTarget, relevantConstraints: [],
      });
    }

    const relevantConstraints = relevantProposalShape(inquiryTarget, proposals);
    for (const entityType of relevantConstraints) {
      const status = resolution?.[entityType]?.status;
      if (status === 'AMBIGUOUS') {
        return decision(DECISIONS.CLARIFY, 'RELEVANT_CONSTRAINT_AMBIGUOUS', {
          dialogAct, inquiryTarget, relevantConstraints, entityType,
        });
      }
      if (status !== 'RESOLVED') {
        return decision(DECISIONS.CLARIFY, 'RELEVANT_CONSTRAINT_UNRESOLVED', {
          dialogAct, inquiryTarget, relevantConstraints, entityType,
        });
      }
    }
    return decision(DECISIONS.ROUTE_TO_DOMAIN_QUERY, 'RELEVANT_CONSTRAINTS_RESOLVED', {
      dialogAct, inquiryTarget, relevantConstraints,
    });
  }
}

function relevantProposalShape(inquiryTarget, proposals) {
  const proposed = new Set(ENTITY_TYPES.filter((type) => hasProposal(proposals, type)));
  const relevant = [];
  if (proposed.has('service')) relevant.push('service');
  else if (proposed.has('specialty')) relevant.push('specialty');
  if (proposed.has('branch')) relevant.push('branch');
  if (proposed.has('city')) relevant.push('city');
  return Object.freeze(relevant);
}

function hasProposal(proposals, entityType) {
  if (!proposals || typeof proposals !== 'object') return false;
  if (entityType === 'city') return bounded(proposals.city);
  return bounded(proposals[`${entityType}Id`]) ||
    bounded(proposals[`${entityType}Text`]) ||
    (Array.isArray(proposals[`${entityType}Candidates`]) &&
      proposals[`${entityType}Candidates`].length > 0);
}
function bounded(value) { return typeof value === 'string' && value.trim() !== ''; }
function decision(action, reason, details) {
  return Object.freeze({ action, reason, ...details });
}

module.exports = FactualQueryPolicy;
module.exports.DECISIONS = DECISIONS;
module.exports.MIGRATED_TARGETS = MIGRATED_TARGETS;
module.exports.relevantProposalShape = relevantProposalShape;
