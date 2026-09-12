'use strict';

const DECISIONS = Object.freeze([
  'RESOLVED',
  'AMBIGUOUS',
  'NOT_FOUND',
]);

class SemanticCandidateResolver {
  constructor({
    provider,
  } = {}) {
    if (
      !provider ||
      typeof provider.completeJson !== 'function'
    ) {
      throw new TypeError(
        'SemanticCandidateResolver requires provider.completeJson().'
      );
    }

    this.provider = provider;
  }

  async resolve({
    surface,
    semanticMeaning,
    candidates,
    discoveryRows = [],
  } = {}) {
    const inputSurface =
      requireText(surface, 'surface');

    const meaning =
      requireText(
        semanticMeaning,
        'semanticMeaning'
      );

    if (!Array.isArray(candidates)) {
      throw new TypeError(
        'candidates must be an array.'
      );
    }

    if (!Array.isArray(discoveryRows)) {
      throw new TypeError(
        'discoveryRows must be an array.'
      );
    }

    if (candidates.length === 0) {
      return Object.freeze({
        decision: 'NOT_FOUND',
        candidateIndex: null,
        model: null,
        usage: null,
      });
    }

    const boundedCandidates =
      candidates.slice(0, 5);

    const candidateEvidence =
      boundedCandidates.map(
        (candidate, candidateIndex) => {
          const serviceName =
            requireText(
              candidate?.serviceName,
              'candidate.serviceName'
            );

          const rows =
            discoveryRows.filter(
              (row) =>
                row &&
                String(
                  row.service_id ??
                  row.serviceId ??
                  ''
                ) ===
                String(
                  candidate?.serviceId ??
                  ''
                )
            );

          const evidence =
            rows
              .map((row) => ({
                title:
                  optionalText(row.title),

                keywords:
                  humanKeywords(
                    row.keywords
                  ),
              }))
              .filter(
                (item) =>
                  item.title ||
                  item.keywords.length > 0
              );

          if (
            evidence.length === 0 &&
            optionalText(
              candidate?.knowledgeTitle
            )
          ) {
            evidence.push({
              title:
                optionalText(
                  candidate.knowledgeTitle
                ),
              keywords: [],
            });
          }

          return {
            candidateIndex,
            serviceName,
            evidence,
          };
        }
      );

    const messages = [
      {
        role: 'system',
        content: [
          'You are a constrained semantic candidate resolver.',
          '',
          'Your only task is to decide whether exactly one supplied clinic service candidate clearly matches the customer meaning.',
          '',
          'Return JSON only with exactly these keys:',
          '{"decision":"RESOLVED|AMBIGUOUS|NOT_FOUND","candidateIndex":0}',
          '',
          'Rules:',
          '- Select only from the supplied candidates.',
          '- Never invent a service.',
          '- Compare meaning semantically, including natural and colloquial phrasing.',
          '- Use the service name and supplied discovery evidence.',
          '- Candidate order is not evidence.',
          '- Do not assume candidate 0 is best.',
          '- Do not use or infer medical suitability, safety, diagnosis, contraindications, or recommendations.',
          '- If exactly one candidate clearly matches the expressed need, return RESOLVED.',
          '- If multiple candidates reasonably match because the request is broad or underspecified, return AMBIGUOUS.',
          '- If none of the supplied candidates meaningfully matches, return NOT_FOUND.',
          '- A broad treatment family must remain AMBIGUOUS when several supplied candidates fit and the customer did not distinguish between them.',
          '',
          'For RESOLVED, candidateIndex must be the zero-based index of the selected candidate.',
          'For AMBIGUOUS or NOT_FOUND, candidateIndex must be null.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          surface: inputSurface,
          semanticMeaning: meaning,
          candidates: candidateEvidence,
        }),
      },
    ];

    const response =
      await this.provider.completeJson(
        messages
      );

    const result =
      validateResult(
        response?.result,
        boundedCandidates.length
      );

    return Object.freeze({
      decision:
        result.decision,

      candidateIndex:
        result.candidateIndex,

      model:
        response?.model || null,

      usage:
        response?.usage || null,
    });
  }
}

function validateResult(
  result,
  candidateCount
) {
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result)
  ) {
    throw new Error(
      'Invalid semantic candidate resolver result.'
    );
  }

  const keys =
    Object.keys(result).sort();

  if (
    keys.length !== 2 ||
    keys[0] !== 'candidateIndex' ||
    keys[1] !== 'decision'
  ) {
    throw new Error(
      'Resolver must return decision and candidateIndex only.'
    );
  }

  if (
    !DECISIONS.includes(
      result.decision
    )
  ) {
    throw new Error(
      'Resolver decision is invalid.'
    );
  }

  if (
    result.decision === 'RESOLVED'
  ) {
    if (
      !Number.isInteger(
        result.candidateIndex
      ) ||
      result.candidateIndex < 0 ||
      result.candidateIndex >=
        candidateCount
    ) {
      throw new Error(
        'RESOLVED requires a valid candidateIndex.'
      );
    }
  } else if (
    result.candidateIndex !== null
  ) {
    throw new Error(
      'AMBIGUOUS and NOT_FOUND require candidateIndex null.'
    );
  }

  return Object.freeze({
    decision:
      result.decision,

    candidateIndex:
      result.candidateIndex,
  });
}

function humanKeywords(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item) =>
        typeof item === 'string'
    )
    .map(
      (item) =>
        item.trim()
    )
    .filter(Boolean)
    .filter(
      (item) =>
        !/^[A-Za-z_]+:/.test(item)
    );
}

function requireText(
  value,
  name
) {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    throw new TypeError(
      `${name} must be a non-empty string.`
    );
  }

  return value.trim();
}

function optionalText(value) {
  return (
    typeof value === 'string' &&
    value.trim()
  )
    ? value.trim()
    : null;
}

module.exports =
  SemanticCandidateResolver;