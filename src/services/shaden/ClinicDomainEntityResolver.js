'use strict';

const {
  createClinicDomainConstraints,
} = require('../../contracts/shaden/ClinicDomainConstraints');
const { normalizeArabic } = require('./ShadenArabicNormalizer');
const {
  CatalogGroundedEntityLinker,
  comparisonTokens,
} = require('./CatalogGroundedEntityLinker');

const STATUSES = Object.freeze(['RESOLVED', 'UNRESOLVED', 'AMBIGUOUS']);

class ClinicDomainEntityResolver {
  constructor({ catalogService, catalogEntityLinker = null } = {}) {
    if (typeof catalogService?.list !== 'function') {
      throw new TypeError('ClinicDomainEntityResolver requires catalogService.list().');
    }
    this.catalogService = catalogService;
    this.catalogEntityLinker = catalogEntityLinker || new CatalogGroundedEntityLinker();
  }

  async resolve(clinicId, proposals = {}, { text = null } = {}) {
    if (!clinicId) throw new TypeError('ClinicDomainEntityResolver requires clinicId.');
    if (!isPlainObject(proposals)) {
      throw new TypeError('Domain entity proposals must be a plain object.');
    }
    const [specialties, services, branches] = await Promise.all([
      this.catalogService.list('specialties', clinicId, { active: true }),
      this.catalogService.list('services', clinicId, { active: true }),
      this.catalogService.list('branches', clinicId, { active: true }),
    ]);
    const links = this.catalogEntityLinker.link({
      text,
      specialties: active(specialties),
      services: active(services).filter((item) => item.is_booking_enabled !== false),
      branches: active(branches),
    });
    const reconciledProposals = reconcileProposals(proposals, links, {
      specialty: { entities: active(specialties), aliases: false },
      service: {
        entities: active(services).filter((item) => item.is_booking_enabled !== false),
        aliases: true,
      },
      branch: { entities: active(branches), aliases: false },
    });

    const specialty = applyLinkAmbiguity(resolveEntity({
      id: reconciledProposals.specialtyId,
      text: reconciledProposals.specialtyText,
      candidates: reconciledProposals.specialtyCandidates,
      entities: active(specialties),
    }), links.specialty);
    const service = applyLinkAmbiguity(resolveEntity({
      id: reconciledProposals.serviceId,
      text: reconciledProposals.serviceText,
      candidates: reconciledProposals.serviceCandidates,
      entities: active(services).filter((item) => item.is_booking_enabled !== false),
      aliases: true,
    }), links.service);
    const branch = applyLinkAmbiguity(resolveEntity({
      id: reconciledProposals.branchId,
      text: reconciledProposals.branchText,
      candidates: reconciledProposals.branchCandidates,
      entities: active(branches),
    }), links.branch);
    const city = resolveCity(reconciledProposals.city, active(branches));
    const scalar = safeScalarConstraints(reconciledProposals);
    const constraints = createClinicDomainConstraints({
      ...scalar,
      ...(specialty.status === 'RESOLVED' ? { specialtyId: specialty.id } : {}),
      ...(service.status === 'RESOLVED' ? { serviceId: service.id } : {}),
      ...(branch.status === 'RESOLVED' ? { branchId: branch.id } : {}),
      ...(city.status === 'RESOLVED' ? { city: city.value } : {}),
    });

    return Object.freeze({
      proposals: Object.freeze(reconciledProposals),
      links,
      constraints,
      resolution: Object.freeze({ specialty, service, branch, city }),
    });
  }
}

function applyLinkAmbiguity(resolved, link) {
  if (link?.status !== 'AMBIGUOUS') return resolved;
  return resolution('AMBIGUOUS', {
    proposals: Object.freeze(link.candidates.map(({ name }) => name)),
    ...(link.reason ? { reason: link.reason } : {}),
  });
}

function reconcileProposals(proposals, links, catalogs) {
  const result = { ...proposals };
  removeCrossEntityContamination(result, links);
  for (const entityType of ['specialty', 'service', 'branch']) {
    const link = links?.[entityType];
    if (link?.status === 'RESOLVED') {
      const idField = `${entityType}Id`;
      const existing = resolveEntity({
        id: result[idField],
        text: result[`${entityType}Text`],
        candidates: result[`${entityType}Candidates`],
        entities: catalogs[entityType].entities,
        aliases: catalogs[entityType].aliases,
      });
      if (existing.status === 'RESOLVED' && existing.id !== link.id) {
        delete result[idField];
        delete result[`${entityType}Text`];
        result[`${entityType}Candidates`] = [
          canonicalEntityName(catalogs[entityType].entities, existing.id),
          link.name,
        ];
      } else if (existing.status !== 'AMBIGUOUS') {
        result[idField] = link.id;
      }
    } else if (link?.status === 'AMBIGUOUS' && !hasEntityProposal(result, entityType)) {
      result[`${entityType}Candidates`] = link.candidates.map(({ name }) => name);
    }
  }
  return result;
}

function canonicalEntityName(entities, id) {
  const entity = entities.find((item) => String(item.id) === String(id));
  return boundedProposal(entity?.display_name_ar) ||
    boundedProposal(entity?.name) || String(id);
}

function removeCrossEntityContamination(proposals, links) {
  for (const entityType of ['specialty', 'service', 'branch']) {
    if (links?.[entityType]?.status === 'RESOLVED') continue;
    const textField = `${entityType}Text`;
    const proposalTokens = comparisonTokens(proposals[textField]);
    if (proposalTokens.length === 0) continue;
    const contaminated = ['specialty', 'service', 'branch']
      .filter((otherType) => otherType !== entityType)
      .map((otherType) => links?.[otherType])
      .filter((link) => link?.status === 'RESOLVED')
      .some((link) => containsTokens(
        proposalTokens,
        comparisonTokens(link.name).filter((token) => token !== 'فرع')
      ));
    if (contaminated) {
      delete proposals[textField];
      delete proposals[`${entityType}Candidates`];
    }
  }
}

function containsTokens(source, target) {
  if (target.length === 0 || source.length < target.length) return false;
  return source.some((_token, start) => target.every(
    (token, offset) => source[start + offset] === token
  ));
}

function hasEntityProposal(proposals, entityType) {
  return boundedProposal(proposals[`${entityType}Id`]) ||
    boundedProposal(proposals[`${entityType}Text`]) ||
    (Array.isArray(proposals[`${entityType}Candidates`]) &&
      proposals[`${entityType}Candidates`].length > 0);
}

function resolveEntity({ id, text, candidates, entities, aliases = false }) {
  if (Array.isArray(candidates) && candidates.length > 1) {
    return resolution('AMBIGUOUS', { proposals: Object.freeze([...candidates]) });
  }
  const proposal = boundedProposal(id) || boundedProposal(text);
  if (!proposal) return resolution('UNRESOLVED');
  const byId = boundedProposal(id)
    ? entities.filter((item) => String(item.id) === String(id).trim())
    : [];
  if (boundedProposal(id)) return entityResolution(byId, proposal);
  const needle = normalizeArabic(proposal);
  const matches = entities.filter((item) => entityNames(item, aliases)
    .some((name) => normalizeArabic(name) === needle));
  return entityResolution(matches, proposal);
}

function entityResolution(matches, proposal) {
  if (matches.length === 1) {
    return resolution('RESOLVED', { id: String(matches[0].id), proposal });
  }
  return resolution(matches.length > 1 ? 'AMBIGUOUS' : 'UNRESOLVED', { proposal });
}

function resolveCity(value, branches) {
  const proposal = boundedProposal(value);
  if (!proposal) return resolution('UNRESOLVED');
  const matches = [...new Map(branches
    .filter((branch) => normalizeArabic(branch.city) === normalizeArabic(proposal))
    .map((branch) => [normalizeArabic(branch.city), branch.city])).values()];
  return matches.length === 1
    ? resolution('RESOLVED', { value: String(matches[0]).trim(), proposal })
    : resolution(matches.length > 1 ? 'AMBIGUOUS' : 'UNRESOLVED', { proposal });
}

function safeScalarConstraints(proposals) {
  try {
    const normalized = createClinicDomainConstraints({
      date: proposals.date,
      timePeriod: proposals.timePeriod,
    });
    return {
      date: normalized.date,
      timePeriod: normalized.timePeriod,
    };
  } catch {
    return {};
  }
}

function entityNames(item, includeAliases) {
  return [
    item.display_name_ar,
    item.name,
    ...(includeAliases && Array.isArray(item.aliases) ? item.aliases : []),
  ].filter((value) => boundedProposal(value));
}

function active(items) {
  return Array.isArray(items) ? items.filter((item) => item?.is_active !== false) : [];
}
function boundedProposal(value) {
  return typeof value === 'string' && value.trim() && value.trim().length <= 200
    ? value.trim()
    : null;
}
function resolution(status, fields = {}) {
  return Object.freeze({ status, ...fields });
}
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

module.exports = Object.freeze({ ClinicDomainEntityResolver, STATUSES });
