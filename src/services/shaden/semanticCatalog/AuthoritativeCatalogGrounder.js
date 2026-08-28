'use strict';

const SEARCHED_FIELDS = Object.freeze({
  CATALOG_REFERENCE: [
    'service.name', 'service.aliases', 'service.description',
    'specialty.name', 'specialty.description',
  ],
  LOCATION_REFERENCE: ['branch.name', 'branch.city', 'branch.address'],
});
const EVIDENCE_TIERS = Object.freeze({
  IDENTITY: Object.freeze({ NORMALIZED_EXACT: 0, NORMALIZED_PHRASE_CONTAINMENT: 2 }),
  ALIAS: Object.freeze({ NORMALIZED_EXACT: 1, NORMALIZED_PHRASE_CONTAINMENT: 3 }),
  LOCATION: Object.freeze({ NORMALIZED_EXACT: 0, NORMALIZED_PHRASE_CONTAINMENT: 2 }),
  DESCRIPTION: Object.freeze({ NORMALIZED_EXACT: 4, NORMALIZED_PHRASE_CONTAINMENT: 5 }),
});

function groundReference(reference, catalog) {
  const inputs = uniqueInputs(reference);
  const matches = matchesForKind(reference.kind, catalog, inputs);
  if (!matches.length) return result('NOT_FOUND', [], inputs, null, 0);
  const strongestTier = Math.min(...matches.map((match) => match.evidenceTier));
  const retained = matches.filter((match) => match.evidenceTier === strongestTier);
  const candidates = candidatesFrom(retained).sort(candidateOrder);
  return result(
    candidates.length === 1 ? 'RESOLVED' : 'AMBIGUOUS',
    candidates,
    inputs,
    strongestTier,
    uniqueCandidateCount(matches) - candidates.length
  );
}

function matchesForKind(kind, catalog, inputs) {
  if (kind === 'CATALOG_REFERENCE') return [
    ...matchesFor('SERVICE', catalog.services, inputs, 'CATALOG_REFERENCE'),
    ...matchesFor('SPECIALTY', catalog.specialties, inputs, 'CATALOG_REFERENCE'),
  ];
  if (kind === 'LOCATION_REFERENCE') return matchesFor('BRANCH', catalog.branches, inputs, kind);
  throw new TypeError('unsupported semantic reference kind');
}

function matchesFor(entityType, entities = [], inputs, referenceKind) {
  return entities.flatMap((entity) => evidenceFor(entityType, entity, referenceKind).flatMap((item) =>
    inputs.flatMap((input) => match(input, item, {
      allowArabicArticleEquivalence: true,
    }).map((matched) => ({
      entityType,
      authoritativeEntityId: entity.id,
      authoritativeEntityName: entity.name,
      matchedField: item.field,
      matchedText: item.text,
      evidenceKind: item.kind,
      evidenceStrength: strengthName(item.kind),
      evidenceTier: EVIDENCE_TIERS[item.kind][matched.method],
      matchMethod: matched.method,
      normalizationMethod: matched.normalizationMethod,
      inputSource: input.source,
      inputText: input.text,
    })))
  ));
}

function evidenceFor(type, entity) {
  if (type === 'SERVICE') return compact([
    evidence('service.name', entity.name, 'IDENTITY'),
    ...(entity.aliases || []).map((alias) => evidence('service.aliases', alias, 'ALIAS')),
    evidence('service.description', entity.description, 'DESCRIPTION'),
  ]);
  if (type === 'SPECIALTY') return compact([
    evidence('specialty.name', entity.name, 'IDENTITY'),
    evidence('specialty.description', entity.description, 'DESCRIPTION'),
  ]);
  return compact([
    evidence('branch.name', entity.name, 'LOCATION'),
    evidence('branch.city', entity.city, 'LOCATION'),
    evidence('branch.address', entity.address, 'LOCATION'),
  ]);
}

function match(input, item, { allowArabicArticleEquivalence }) {
  if (['ALIAS', 'DESCRIPTION'].includes(item.kind) && words(normalize(input.text)) < 2) return [];
  const direct = compareForms(normalize(input.text), normalize(item.text));
  if (direct) return [{ ...direct, normalizationMethod: 'STANDARD' }];
  if (!allowArabicArticleEquivalence) return [];
  const articleNormalized = compareForms(
    stripArabicDefiniteArticles(normalize(input.text)),
    stripArabicDefiniteArticles(normalize(item.text))
  );
  return articleNormalized
    ? [{ ...articleNormalized, normalizationMethod: 'ARABIC_DEFINITE_ARTICLE_EQUIVALENCE' }]
    : [];
}

function compareForms(query, value) {
  if (!query || !value) return null;
  if (query === value) return { method: 'NORMALIZED_EXACT' };
  if (containsPhrase(query, value) || containsPhrase(value, query)) {
    return { method: 'NORMALIZED_PHRASE_CONTAINMENT' };
  }
  return null;
}

function candidatesFrom(matches) {
  const grouped = new Map();
  for (const item of matches) {
    const key = `${item.entityType}:${item.authoritativeEntityId}`;
    const current = grouped.get(key);
    if (!current || betterEvidence(item, current)) grouped.set(key, item);
  }
  return [...grouped.values()];
}
function betterEvidence(left, right) {
  if (left.evidenceTier !== right.evidenceTier) return left.evidenceTier < right.evidenceTier;
  return left.inputSource === 'surface' && right.inputSource !== 'surface';
}
function uniqueCandidateCount(matches) {
  return new Set(matches.map((item) => `${item.entityType}:${item.authoritativeEntityId}`)).size;
}
function result(status, candidates, inputs, strongestTier, discardedWeakerCandidateCount) {
  return {
    status,
    resolution: status === 'RESOLVED' ? candidates[0] : null,
    candidates,
    interpretedMeaningUsed: inputs,
    searchedEvidenceClasses: SEARCHED_FIELDS,
    selection: {
      strongestEvidenceTier: strongestTier,
      strongestEvidenceStrength: strongestTier === null ? null : strengthForTier(strongestTier),
      discardedWeakerCandidateCount,
      reason: strongestTier === null
        ? 'NO_AUTHORITATIVE_EVIDENCE'
        : 'ONLY_STRONGEST_AUTHORITATIVE_IDENTITY_EVIDENCE_RETAINED',
    },
  };
}

function evidence(field, text, kind) { return normalize(text) ? { field, text, kind } : null; }
function compact(values) { return values.filter(Boolean); }
function uniqueInputs(reference) {
  const values = [
    { source: 'interpretedMeaning', text: reference.interpretedMeaning },
    { source: 'surface', text: reference.surface },
  ].filter((item) => normalize(item.text));
  const seen = new Set();
  return values.filter((item) => {
    const key = normalize(item.text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function normalize(value) {
  return String(value || '').normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/gu, '')
    .replace(/[أإآٱ]/gu, 'ا').replace(/ى/gu, 'ي').replace(/ـ/gu, '')
    .toLocaleLowerCase('und').replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}
function stripArabicDefiniteArticles(value) {
  return value.split(' ').map((token) => /^ال[\u0621-\u064A]{2,}$/u.test(token) ? token.slice(2) : token).join(' ');
}
function containsPhrase(container, phrase) { return Boolean(container && phrase && ` ${container} `.includes(` ${phrase} `)); }
function words(value) { return value ? value.split(' ').length : 0; }
function strengthName(kind) {
  return { IDENTITY: 'DIRECT_IDENTITY', ALIAS: 'OFFICIAL_ALIAS', LOCATION: 'DIRECT_LOCATION', DESCRIPTION: 'DESCRIPTION' }[kind];
}
function strengthForTier(tier) {
  return tier <= 0 ? 'DIRECT_EXACT' : tier === 1 ? 'ALIAS_OR_NEED_EXACT' : tier === 2 ? 'DIRECT_CONTAINMENT' : tier === 3 ? 'ALIAS_CONTAINMENT' : 'DESCRIPTION';
}
function candidateOrder(left, right) { return `${left.entityType}:${left.authoritativeEntityId}`.localeCompare(`${right.entityType}:${right.authoritativeEntityId}`); }

module.exports = Object.freeze({
  SEARCHED_FIELDS, EVIDENCE_TIERS, groundReference, normalize,
  stripArabicDefiniteArticles,
});
