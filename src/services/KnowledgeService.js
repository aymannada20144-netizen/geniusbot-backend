'use strict';

const KnowledgeResult = require('../contracts/shaden/KnowledgeResult');
const { ValidationError } = require('../core/errors');
const {
  validatePlainObject,
  validateUuid,
} = require('../core/validators/commonValidators');

const KNOWLEDGE_TYPES = new Set([
  'medical_faq',
  'service_faq',
  'clinic_policy',
]);
const SEMANTIC_TOPICS = new Set([
  'preparation',
  'aftercare',
  'comparison',
]);

class KnowledgeService {
  constructor(knowledgeBaseRepository) {
    if (
      !knowledgeBaseRepository ||
      typeof knowledgeBaseRepository.findEligibleCandidates !== 'function'
    ) {
      throw new TypeError(
        'KnowledgeService requires knowledgeBaseRepository.findEligibleCandidates().'
      );
    }
    this.knowledgeBaseRepository = knowledgeBaseRepository;
  }

  async retrieve(input) {
    const request = validateRequest(input);
    let candidates;

    try {
      candidates = await this.knowledgeBaseRepository.findEligibleCandidates({
        clinicId: request.clinicId,
        serviceId: request.serviceId,
        category: request.type,
      });
    } catch (_error) {
      return result(request.type, 'unavailable', {
        warnings: ['knowledge_retrieval_failed'],
      });
    }

    if (!Array.isArray(candidates)) {
      return result(request.type, 'unavailable', {
        warnings: ['knowledge_retrieval_failed'],
      });
    }

    const ranked = candidates
      .map((candidate) => scoreCandidate(candidate, request))
      .filter((candidate) => candidate.qualifies)
      .sort(compareCandidates);

    if (ranked.length === 0) {
      return result(request.type, 'not_found', {
        warnings: ['knowledge_not_found'],
      });
    }

    const row = ranked[0].row;
    const reference = Object.freeze({
      id: row.id,
      title: row.title,
      category: row.category,
      serviceId: row.service_id,
    });

    return result(request.type, 'found', {
      facts: [row.content],
      references: [reference],
    });
  }
}

function validateRequest(input) {
  validatePlainObject(input, 'Knowledge request');
  validateUuid(input.clinicId, 'clinicId');

  const serviceId = input.serviceId === undefined || input.serviceId === null
    ? null
    : input.serviceId;
  if (serviceId !== null) validateUuid(serviceId, 'serviceId');

  if (input.source !== 'knowledge_base') {
    throw new ValidationError('Knowledge request source must be knowledge_base.');
  }
  if (!KNOWLEDGE_TYPES.has(input.type)) {
    throw new ValidationError('Knowledge request type is unsupported.');
  }

  if (
    input.query !== undefined &&
    input.query !== null &&
    typeof input.query !== 'string'
  ) {
    throw new ValidationError('Knowledge request query must be a string.');
  }
  if (
    input.semanticTopic !== undefined &&
    input.semanticTopic !== null &&
    !SEMANTIC_TOPICS.has(input.semanticTopic)
  ) {
    throw new ValidationError('Knowledge request semanticTopic is unsupported.');
  }
  if (input.keywords !== undefined && !Array.isArray(input.keywords)) {
    throw new ValidationError('Knowledge request keywords must be an Array.');
  }
  if (
    Array.isArray(input.keywords) &&
    input.keywords.some((keyword) => typeof keyword !== 'string')
  ) {
    throw new ValidationError(
      'Knowledge request keywords must contain only strings.'
    );
  }

  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const keywords = Array.isArray(input.keywords)
    ? input.keywords.map((keyword) => keyword.trim()).filter(Boolean)
    : [];

  if (!query && keywords.length === 0) {
    throw new ValidationError(
      'Knowledge request requires a query or at least one keyword.'
    );
  }

  return Object.freeze({
    clinicId: input.clinicId,
    serviceId,
    type: input.type,
    query,
    normalizedQuery: normalizeText(query),
    queryTokens: tokenize(query),
    semanticTopic: input.semanticTopic || null,
    keywords: Object.freeze(uniqueNormalized(keywords)),
  });
}

function scoreCandidate(row, request) {
  const title = normalizeText(row.title);
  const storedKeywords = uniqueNormalized(
    Array.isArray(row.keywords) ? row.keywords : []
  );
  const titleTokens = new Set(tokenize(row.title));
  const contentTokens = new Set(tokenize(row.content));
  const exactTitle = request.normalizedQuery !== '' &&
    request.normalizedQuery === title;
  const keywordMatches = storedKeywords.filter((keyword) =>
    request.keywords.includes(keyword) ||
    completePhrase(request.normalizedQuery, keyword)
  );
  const titleOverlap = overlapCount(request.queryTokens, titleTokens);
  const contentOverlap = overlapCount(request.queryTokens, contentTokens);
  const rowTopic = medicalTopicForRow(row);
  const topicMatch = request.type === 'medical_faq' &&
    request.semanticTopic !== null &&
    rowTopic === request.semanticTopic;
  const qualifies = request.type === 'medical_faq'
    ? topicMatch ||
      exactTitle ||
      keywordMatches.length >= 2 ||
      titleOverlap >= 2
    : exactTitle || keywordMatches.length > 0 || titleOverlap >= 2;

  return {
    row,
    topicMatch: topicMatch ? 1 : 0,
    exactTitle: exactTitle ? 1 : 0,
    keywordMatches: keywordMatches.length,
    titleOverlap,
    serviceSpecific: request.serviceId !== null &&
      sameIdentifier(row.service_id, request.serviceId) ? 1 : 0,
    priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : 0,
    contentOverlap,
    qualifies,
  };
}

function compareCandidates(left, right) {
  const descendingFields = [
    'topicMatch',
    'exactTitle',
    'keywordMatches',
    'titleOverlap',
    'serviceSpecific',
    'priority',
    'contentOverlap',
  ];
  for (const field of descendingFields) {
    if (left[field] !== right[field]) return right[field] - left[field];
  }
  const leftId = String(left.row.id);
  const rightId = String(right.row.id);
  if (leftId === rightId) return 0;
  return leftId < rightId ? -1 : 1;
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\u0640/gu, '')
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/gu, '')
    .replace(/[\u0622\u0623\u0625]/gu, '\u0627')
    .replace(/\u0649/gu, '\u064a')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function medicalTopicForRow(row) {
  if (row?.category !== 'medical_faq') return null;
  const title = normalizeText(row.title);
  if (title.startsWith('تحضير ')) return 'preparation';
  if (title.startsWith('عناية ما بعد ')) return 'aftercare';
  if (title.startsWith('الفرق ')) return 'comparison';
  return null;
}

function tokenize(value) {
  const normalized = normalizeText(value);
  return normalized ? [...new Set(normalized.split(' '))] : [];
}

function uniqueNormalized(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function completePhrase(query, phrase) {
  if (!query || !phrase) return false;
  return ` ${query} `.includes(` ${phrase} `);
}

function overlapCount(tokens, candidateTokens) {
  return tokens.reduce(
    (count, token) => count + (candidateTokens.has(token) ? 1 : 0),
    0
  );
}

function sameIdentifier(left, right) {
  return typeof left === 'string' &&
    left.toLowerCase() === right.toLowerCase();
}

function result(type, status, {
  facts = [],
  references = [],
  warnings = [],
} = {}) {
  return KnowledgeResult.create({
    type,
    status,
    facts,
    options: [],
    references,
    warnings,
  });
}

module.exports = KnowledgeService;
