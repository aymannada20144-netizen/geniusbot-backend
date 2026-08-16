'use strict';

const Groq = require('groq-sdk');
const {
  SEMANTIC_CORE_JSON_SCHEMA,
} = require('../../contracts/shaden/SemanticCoreResult');
const {
  createSemanticContext,
} = require('../../contracts/shaden/SemanticContext');

const GROQ_SEMANTIC_CORE_WIRE_SCHEMA = Object.freeze({
  ...SEMANTIC_CORE_JSON_SCHEMA,
  required: Object.freeze(Object.keys(SEMANTIC_CORE_JSON_SCHEMA.properties)),
});

class GroqSemanticCoreModelClient {
  constructor({ client, model } = {}) {
    if (typeof client?.chat?.completions?.create !== 'function') {
      throw new TypeError(
        'GroqSemanticCoreModelClient requires a Groq-compatible client.'
      );
    }
    if (typeof model !== 'string' || !model.trim()) {
      throw new TypeError('GroqSemanticCoreModelClient requires a model name.');
    }
    this.client = client;
    this.model = model.trim();
  }

  async inferSemanticCore({ text, context } = {}) {
    if (typeof text !== 'string' || !text.trim()) {
      throw new TypeError('Groq semantic core inference requires text.');
    }

    const input = { text };
    if (context !== undefined) {
      input.context = createSemanticContext(context);
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'shaden_semantic_core_v2',
          strict: true,
          schema: GROQ_SEMANTIC_CORE_WIRE_SCHEMA,
        },
      },
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: JSON.stringify(input) },
      ],
    });

    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Groq semantic core inference returned no structured content.');
    }
    return content;
  }
}

function createGroqSemanticCoreModelClient({ apiKey, model } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new TypeError('A Groq API key is required.');
  }
  return new GroqSemanticCoreModelClient({
    client: new Groq({ apiKey: apiKey.trim() }),
    model,
  });
}

const SYSTEM_INSTRUCTION = [
  'You are a routing-only natural-language understanding component for an Arabic clinic assistant.',
  'Return only one SemanticCoreResult contractVersion 2 JSON object matching the supplied schema.',
  'Classify the user business goal separately from the conversationAct, which represents the user semantic stance or function.',
  'Information covers requests for clinic, service, price, policy, or medically framed information. Booking requests a new appointment. Availability asks for appointment slots. Appointment query concerns an existing appointment. Appointment change changes a detail of an existing appointment. Appointment cancel and appointment reschedule express those respective goals. Human handover asks to communicate with clinic staff. Social engagement has no clinic business task. Unknown means no supported routing goal is established.',
  'Use inform when the user provides information. Use request for inquiries and requests, including requests to clarify. Use accept when the user accepts or affirms, reject when the user declines, and correct when the user repairs or replaces prior information. Complaint reports dissatisfaction with an experienced result, service, delay, failure, or interaction. Objection expresses a substantive barrier or concern about proceeding. Hesitation expresses uncertainty or a wish to wait without a substantive objection. Social covers courtesy and casual social interaction.',
  'ConversationAct is the user stance, not the pending interaction type. SemanticContext.pending.kind states what the assistant is waiting for; do not duplicate selection or any other pending kind as a conversationAct. PrimaryGoal states the business or domain outcome. Deterministic runtime remains authoritative over state, option validation, transitions, and execution.',
  'Complaint, objection, hesitation, and social are conversational acts, never business goals. For a purely social utterance with no other supported operational business goal, primaryGoal must be social_engagement. For complaint, objection, hesitation, accept, reject, or correct without an independent supported business goal, primaryGoal must be unknown. Never copy a conversationAct into primaryGoal or additionalGoals.',
  'A change to the date or time of an existing appointment is appointment_reschedule. A change to a non-time appointment attribute, such as its service, branch, or provider, is appointment_change.',
  'Use uncertain when materially different routing meanings remain plausible. Use dependent whenever correct interpretation or safe execution needs conversational context absent from the current utterance. This includes bare confirmations or rejections with no available target, elliptical follow-ups, unresolved references or deictic expressions, and selection fragments whose options are unavailable. If the conversational act is identifiable but its target or referent is not, use dependent and never guess the missing referent.',
  'The optional SemanticContext is bounded evidence from authoritative deterministic state for interpreting only the current user text. Use it to resolve the active goal or the target of a pending confirmation, rejection, correction, selection, or follow-up when it provides sufficient meaning. When context resolves an otherwise dependent utterance, interpret it with that context and do not mark it dependent solely because the text would be dependent in isolation. If the required meaning remains missing or ambiguous, keep interpretation dependent and do not invent it.',
  'Do not treat SemanticContext as another user message, mutate or redesign state, execute actions, select records, assume absent identifiers or options, override interactive payloads, or turn context into business execution instructions.',
  'When an utterance repairs or replaces prior content and also has the grammatical form of a request, correct outranks request as the conversationAct.',
  'primaryGoal is the operational goal that must be handled first to respect the user expressed sequence, dependency, or condition. A prerequisite or condition that must be resolved before another requested operation is primary; preserve the other explicit supported goal in additionalGoals. Do not automatically choose the ultimate outcome or merely the first-mentioned goal.',
  'additionalGoals is bounded evidence for at most one other explicit supported business goal. It is not a secondary-intent analysis.',
  'The transport requires mentionedEntities and additionalGoals in every response. Emit an empty array for either field when it is semantically absent.',
  'Extract only explicitly mentioned services, branches, or providers. surfaceText must be copied as an exact contiguous substring. conceptText may normalize morphology but must not add meaning or specialize the wording.',
  'Never resolve an entity to a clinic catalog entry. Never output identifiers, UUIDs, database keys, catalog matches, dates, times, booking references, correction pairs, or workflow roles.',
  'Do not answer the user, generate medical knowledge, select a runtime action, or execute appointment behavior.',
].join(' ');

module.exports = GroqSemanticCoreModelClient;
module.exports.createGroqSemanticCoreModelClient =
  createGroqSemanticCoreModelClient;
module.exports.GROQ_SEMANTIC_CORE_WIRE_SCHEMA =
  GROQ_SEMANTIC_CORE_WIRE_SCHEMA;
