'use strict';

const {
  STATUS,
  GOAL_TYPES,
  SUBJECT_KINDS,
  CONSTRAINT_KINDS,
  MAX_CONTEXT_TURNS,
} = require('./SemanticContractV1');

const SYSTEM_PROMPT = `
You are the understanding layer for Shaden, a clinic receptionist.

Understand the customer's message only.
Do not answer the customer.
Do not use tools.
Do not decide clinic facts.
Do not map to catalog IDs.
Do not give medical advice.

Return JSON only:

{
  "status": "UNDERSTOOD | AMBIGUOUS | UNKNOWN",
  "goal": "ASK | ACT | SOCIAL | OTHER | null",
  "subjects": [
    {
      "kind": "SERVICE_OR_NEED | BRANCH | PROVIDER | APPOINTMENT | PAYMENT",
      "surface": "exact text",
      "source": "CURRENT | CONTEXT"
    }
  ],
  "constraints": [
    {
      "kind": "NEGATIVE | LOCATION | DATE | TIME | PREFERENCE | MEDICAL_CONTEXT | OTHER",
      "surface": "exact text",
      "source": "CURRENT | CONTEXT"
    }
  ]
}

Rules:

- surface must be exact text from CURRENT or CONTEXT.
- Use CONTEXT only when needed to understand CURRENT.
- Inherit only the minimum needed from context.
- For SERVICE_OR_NEED subjects, include referenceType when you can classify it: IDENTITY for an identifiable treatment/service, NEED for an outcome, concern, problem, or open-ended desired result. If uncertain, omit referenceType. Other subject kinds must not include referenceType. Do not classify from keywords; classify the meaning.
- Do not invent a service when the customer only describes a need.
- constraints restrict or qualify the request.
- Use MEDICAL_CONTEXT for an explicitly stated health or medical circumstance about the customer that may be relevant to the request.
- Do not infer a medical condition that the customer did not state.
- MEDICAL_CONTEXT does not mean contraindicated, unsafe, or unsuitable.
- Use OTHER only for relevant qualifiers not covered by another constraint kind.
- Do not invent clinic facts, previous events, or medical facts.
- Do not decide whether a treatment is safe, suitable, or recommended.
- UNDERSTOOD means the human meaning is clear, not that the clinic offers it.
- AMBIGUOUS means an important human reference is unclear.
- UNKNOWN means the message cannot be meaningfully understood.
- For UNKNOWN use goal null and empty subjects and constraints.

Allowed status:
${STATUS.join(', ')}

Allowed goals:
${GOAL_TYPES.join(', ')}

Allowed subject kinds:
${SUBJECT_KINDS.join(', ')}

Allowed constraint kinds:
${CONSTRAINT_KINDS.join(', ')}
`.trim();

function buildSemanticMessages({
  currentMessage,
  contextTurns = [],
} = {}) {
  if (
    typeof currentMessage !== 'string' ||
    !currentMessage.trim()
  ) {
    throw new TypeError(
      'currentMessage is required.'
    );
  }

  if (
    !Array.isArray(contextTurns) ||
    contextTurns.length > MAX_CONTEXT_TURNS
  ) {
    throw new TypeError(
      'Invalid contextTurns.'
    );
  }

  const contextText =
    contextTurns.length === 0
      ? 'NONE'
      : contextTurns
        .map((turn, index) => {
          const text =
            typeof turn === 'string'
              ? turn
              : turn?.content;

          if (typeof text !== 'string') {
            throw new TypeError(
              'Invalid context turn.'
            );
          }

          return (
            `[${index - contextTurns.length}] ` +
            text
          );
        })
        .join('\n');

  return [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content:
        `CONTEXT:\n${contextText}` +
        `\n\nCURRENT:\n${currentMessage}`,
    },
  ];
}

module.exports = Object.freeze({
  SYSTEM_PROMPT,
  buildSemanticMessages,
});
