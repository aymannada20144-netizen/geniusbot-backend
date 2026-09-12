'use strict';

const DEFAULT_TOP_K = 5;

class CandidateGrounder {
  constructor({
    embeddingProvider,
    semanticNormalizer,
    topK = DEFAULT_TOP_K,
  } = {}) {
    if (
      !embeddingProvider ||
      typeof embeddingProvider.embed !== 'function'
    ) {
      throw new TypeError(
        'CandidateGrounder requires embeddingProvider.embed().'
      );
    }

    if (
      !semanticNormalizer ||
      typeof semanticNormalizer.normalize !== 'function'
    ) {
      throw new TypeError(
        'CandidateGrounder requires semanticNormalizer.normalize().'
      );
    }

    if (
      !Number.isInteger(topK) ||
      topK < 1
    ) {
      throw new TypeError(
        'topK must be a positive integer.'
      );
    }

    this.embeddingProvider =
      embeddingProvider;

    this.semanticNormalizer =
      semanticNormalizer;

    this.topK =
      topK;
  }

  async ground({
    surface,
    sourceText = null,
    services,
    discoveryRows,
  } = {}) {
    const query =
      requireText(
        surface,
        'surface'
      );

    if (!Array.isArray(services)) {
      throw new TypeError(
        'services must be an array.'
      );
    }

    if (
      !Array.isArray(discoveryRows)
    ) {
      throw new TypeError(
        'discoveryRows must be an array.'
      );
    }

    /*
     * 1. Authoritative exact name / alias match.
     * No semantic-normalization call is allowed here.
     */
    const exact =
      findExactMatches(
        query,
        services
      );

    if (exact.length > 0) {
      return Object.freeze({
        method: 'EXACT',

        surface: query,

        semanticMeaning: null,

        embeddingQuery: null,

        candidates:
          Object.freeze(
            exact.map(
              (service) =>
                freezeCandidate({
                  service,
                  score: 1,
                  knowledgeId: null,
                  knowledgeTitle: null,
                })
            )
          ),

        normalization: null,

        usage: null,
      });
    }

    /*
     * 2. Semantic normalization.
     * This component sees the human expression only.
     * It does not see the catalog or service IDs.
     */
    const normalized =
      await this.semanticNormalizer
        .normalize({
          surface: query,
          sourceText,
        });

    const semanticMeaning =
      requireText(
        normalized.meaning,
        'semantic meaning'
      );

    const embeddingQuery =
      `${query}\n${semanticMeaning}`;

    /*
     * 3. Only active catalog services are eligible.
     */
    const activeServiceById =
      new Map(
        services
          .filter(
            (service) =>
              service &&
              typeof service.id ===
                'string'
          )
          .map(
            (service) => [
              String(service.id),
              service,
            ]
          )
      );

    const eligibleRows =
      discoveryRows.filter(
        (row) =>
          row &&
          typeof row.service_id ===
            'string' &&
          activeServiceById.has(
            String(row.service_id)
          )
      );

    if (
      eligibleRows.length === 0
    ) {
      return Object.freeze({
        method: 'SEMANTIC',

        surface: query,

        semanticMeaning,

        embeddingQuery,

        candidates:
          Object.freeze([]),

        normalization:
          freezeNormalization(
            normalized
          ),

        usage: null,
      });
    }

    /*
     * 4. Embed Discovery knowledge plus the enriched query.
     */
    const documents =
      eligibleRows.map(
        discoveryDocument
      );

    const response =
      await this.embeddingProvider
        .embed(
          [
            ...documents,
            embeddingQuery,
          ]
        );

    const rowVectors =
      response.vectors.slice(
        0,
        documents.length
      );

    const queryVector =
      response.vectors[
        response.vectors.length - 1
      ];

    /*
     * 5. Keep the best Discovery row for each service.
     */
    const bestByService =
      new Map();

    eligibleRows.forEach(
      (row, index) => {
        const score =
          cosine(
            queryVector,
            rowVectors[index]
          );

        const serviceId =
          String(
            row.service_id
          );

        const current =
          bestByService.get(
            serviceId
          );

        if (
          !current ||
          score > current.score
        ) {
          bestByService.set(
            serviceId,
            {
              row,
              score,
            }
          );
        }
      }
    );

    const candidates =
      [...bestByService.entries()]
        .map(
          ([
            serviceId,
            item,
          ]) => {
            const service =
              activeServiceById.get(
                serviceId
              );

            return freezeCandidate({
              service,

              score:
                item.score,

              knowledgeId:
                item.row.id || null,

              knowledgeTitle:
                item.row.title ||
                null,
            });
          }
        )
        .sort(
          (a, b) =>
            b.score - a.score
        )
        .slice(
          0,
          this.topK
        );

    return Object.freeze({
      method: 'SEMANTIC',

      surface: query,

      semanticMeaning,

      embeddingQuery,

      candidates:
        Object.freeze(
          candidates
        ),

      normalization:
        freezeNormalization(
          normalized
        ),

      usage:
        response.usage ||
        null,
    });
  }
}

function findExactMatches(
  surface,
  services
) {
  const wanted =
    normalize(surface);

  const matches = [];

  for (const service of services) {
    if (!service) {
      continue;
    }

    const names = [
      service.name,

      ...(
        Array.isArray(
          service.aliases
        )
          ? service.aliases
          : []
      ),
    ];

    if (
      names.some(
        (value) =>
          typeof value ===
            'string' &&
          normalize(value) ===
            wanted
      )
    ) {
      matches.push(
        service
      );
    }
  }

  return matches;
}

function discoveryDocument(row) {
  const keywords =
    Array.isArray(row.keywords)
      ? row.keywords
          .filter(
            (item) =>
              typeof item ===
                'string' &&
              item !==
                'knowledge_role:DISCOVERY'
          )
          .map(
            semanticKeyword
          )
          .filter(Boolean)
      : [];

  return [
    row.title || null,
    ...keywords,
  ]
    .filter(Boolean)
    .join('\n');
}

function semanticKeyword(value) {
  const separator =
    value.indexOf(':');

  const semantic =
    separator >= 0
      ? value.slice(
          separator + 1
        )
      : value;

  return semantic
    .replace(/_/g, ' ')
    .trim();
}

function normalize(value) {
  return String(value)
    .trim()
    .toLocaleLowerCase('ar')
    .replace(/\s+/g, ' ');
}

function cosine(a, b) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length !== b.length ||
    a.length === 0
  ) {
    throw new TypeError(
      'Invalid embedding vectors.'
    );
  }

  let dot = 0;
  let aa = 0;
  let bb = 0;

  for (
    let i = 0;
    i < a.length;
    i += 1
  ) {
    dot +=
      a[i] * b[i];

    aa +=
      a[i] * a[i];

    bb +=
      b[i] * b[i];
  }

  const denominator =
    Math.sqrt(aa) *
    Math.sqrt(bb);

  return denominator
    ? dot / denominator
    : 0;
}

function freezeCandidate({
  service,
  score,
  knowledgeId,
  knowledgeTitle,
}) {
  return Object.freeze({
    serviceId:
      String(service.id),

    serviceName:
      service.name || null,

    score,

    knowledgeId,

    knowledgeTitle,
  });
}

function freezeNormalization(
  normalized
) {
  return Object.freeze({
    model:
      normalized.model || null,

    usage:
      normalized.usage || null,
  });
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

module.exports =
  CandidateGrounder;

