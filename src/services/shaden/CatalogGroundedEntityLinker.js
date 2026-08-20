'use strict';

const { normalizeArabic } = require('./ShadenArabicNormalizer');

const ENTITY_TYPES = Object.freeze(['specialty', 'service', 'branch']);

class CatalogGroundedEntityLinker {
  link({ text, specialties = [], services = [], branches = [] } = {}) {
    const source = comparisonTokens(text);
    const matches = [
      ...catalogMatches('specialty', specialties, source),
      ...catalogMatches('service', services, source, { aliases: true }),
      ...catalogMatches('branch', branches, source, { omitBranchLabel: true }),
    ];
    const protectedMatches = arbitrateCrossType(matches, services);
    return Object.freeze(Object.fromEntries(ENTITY_TYPES.map((type) => [
      type,
      linkResolution(protectedMatches.filter((match) => match.entityType === type)),
    ])));
  }
}

function catalogMatches(entityType, entities, source, options = {}) {
  if (source.length === 0 || !Array.isArray(entities)) return [];
  return entities
    .filter((entity) => entity?.is_active !== false && bounded(entity?.id))
    .flatMap((entity) => entityLabels(entity, options).flatMap((label) => {
      const target = comparisonTokens(label.value);
      if (target.length === 0) return [];
      return groundedSpans(source, target).map((span) => Object.freeze({
        entityType,
        id: String(entity.id),
        name: canonicalName(entity),
        matchType: label.matchType,
        start: span.start,
        end: span.end,
        tokenLength: target.length,
        characterLength: target.join(' ').length,
      }));
    }));
}

function entityLabels(entity, { aliases = false, omitBranchLabel = false } = {}) {
  const names = [entity.display_name_ar, entity.name]
    .filter(bounded)
    .map((value) => ({ value, matchType: 'CANONICAL_NAME' }));
  if (aliases && Array.isArray(entity.aliases)) {
    names.push(...entity.aliases.filter(bounded)
      .map((value) => ({ value, matchType: 'CANONICAL_ALIAS' })));
  }
  if (omitBranchLabel) {
    for (const name of [...names]) {
      const tokens = normalizeArabic(name.value).split(' ').filter(Boolean);
      if (tokens.length > 1 && tokens[0] === 'فرع') {
        names.push({
          value: tokens.slice(1).join(' '),
          matchType: 'TYPE_LABEL_OMITTED',
        });
      }
    }
  }
  const seen = new Set();
  return names.filter(({ value }) => {
    const key = comparisonTokens(value).join(' ');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groundedSpans(source, target) {
  const spans = [];
  for (let start = 0; start <= source.length - target.length; start += 1) {
    if (target.every((token, offset) => source[start + offset] === token)) {
      spans.push({ start, end: start + target.length });
    }
  }
  return spans;
}

function protectSpecificIdentity(matches) {
  const services = matches.filter((match) => match.entityType === 'service');
  return matches.filter((match) => match.entityType !== 'specialty' ||
    !services.some((service) => overlaps(match, service) && moreSpecific(service, match)));
}

function arbitrateCrossType(matches, services) {
  const protectedMatches = protectSpecificIdentity(matches);
  const specialties = protectedMatches.filter(({ entityType }) => entityType === 'specialty');
  const serviceById = new Map(services.map((service) => [String(service.id), service]));
  const suppressedServices = new Set();
  const ambiguousKeys = new Set();

  for (const serviceMatch of protectedMatches.filter(({ entityType }) => entityType === 'service')) {
    for (const specialtyMatch of specialties) {
      if (!sameSpan(serviceMatch, specialtyMatch)) continue;
      const service = serviceById.get(serviceMatch.id);
      const childAliasOfMatchedSpecialty =
        serviceMatch.matchType === 'CANONICAL_ALIAS' &&
        bounded(service?.specialty_id) &&
        String(service.specialty_id) === specialtyMatch.id;
      if (childAliasOfMatchedSpecialty) {
        suppressedServices.add(matchKey(serviceMatch));
      } else if (!moreSpecific(serviceMatch, specialtyMatch) &&
        !moreSpecific(specialtyMatch, serviceMatch)) {
        ambiguousKeys.add(matchKey(serviceMatch));
        ambiguousKeys.add(matchKey(specialtyMatch));
      }
    }
  }

  return protectedMatches
    .filter((match) => !suppressedServices.has(matchKey(match)))
    .map((match) => ambiguousKeys.has(matchKey(match))
      ? Object.freeze({ ...match, crossTypeAmbiguous: true })
      : match);
}

function overlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

function moreSpecific(candidate, other) {
  return candidate.tokenLength > other.tokenLength ||
    (candidate.tokenLength === other.tokenLength &&
      candidate.characterLength > other.characterLength);
}

function sameSpan(left, right) {
  return left.start === right.start && left.end === right.end;
}

function matchKey(match) {
  return `${match.entityType}:${match.id}:${match.start}:${match.end}:${match.matchType}`;
}

function linkResolution(matches) {
  if (matches.length === 0) return Object.freeze({ status: 'UNRESOLVED' });
  const maximumTokens = Math.max(...matches.map(({ tokenLength }) => tokenLength));
  const longest = matches.filter(({ tokenLength }) => tokenLength === maximumTokens);
  const maximumCharacters = Math.max(...longest.map(({ characterLength }) => characterLength));
  const strongest = longest.filter(({ characterLength }) => characterLength === maximumCharacters);
  const identities = [...new Map(strongest.map((match) => [match.id, match])).values()];
  if (strongest.some(({ crossTypeAmbiguous }) => crossTypeAmbiguous)) {
    return Object.freeze({
      status: 'AMBIGUOUS',
      candidates: Object.freeze(identities.map(publicLink)),
      reason: 'CROSS_TYPE_IDENTITY_COLLISION',
    });
  }
  if (identities.length !== 1) {
    return Object.freeze({
      status: 'AMBIGUOUS',
      candidates: Object.freeze(identities.map(publicLink)),
    });
  }
  return Object.freeze({ status: 'RESOLVED', ...publicLink(identities[0]) });
}

function publicLink(match) {
  return Object.freeze({
    id: match.id,
    name: match.name,
    matchType: match.matchType,
  });
}

function comparisonTokens(value) {
  return normalizeArabic(value).split(' ').filter(Boolean).map(stripDefiniteArticle);
}

function stripDefiniteArticle(token) {
  return token.startsWith('ال') && Array.from(token.slice(2)).length >= 3
    ? token.slice(2)
    : token;
}

function canonicalName(entity) {
  return bounded(entity.display_name_ar)
    ? entity.display_name_ar.trim()
    : String(entity.name || '').trim();
}

function bounded(value) {
  return typeof value === 'string' && value.trim() && value.trim().length <= 200;
}

module.exports = Object.freeze({
  CatalogGroundedEntityLinker,
  comparisonTokens,
});
