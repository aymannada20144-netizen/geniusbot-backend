'use strict';

const Groq = require('groq-sdk');
const {
  SEMANTIC_UNDERSTANDING_JSON_SCHEMA,
} = require('../../contracts/shaden/SemanticUnderstandingResult');

class GroqSemanticModelClient {
  constructor({ client, model } = {}) {
    if (typeof client?.chat?.completions?.create !== 'function') {
      throw new TypeError('GroqSemanticModelClient requires a Groq-compatible client.');
    }
    if (typeof model !== 'string' || !model.trim()) {
      throw new TypeError('GroqSemanticModelClient requires a model name.');
    }
    this.client = client;
    this.model = model.trim();
  }

  async inferUnderstanding({ text } = {}) {
    if (typeof text !== 'string' || !text.trim()) {
      throw new TypeError('Groq semantic inference requires text.');
    }
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      reasoning_effort: 'low',
      max_completion_tokens: 900,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'shaden_semantic_understanding',
          strict: true,
          schema: SEMANTIC_UNDERSTANDING_JSON_SCHEMA,
        },
      },
      messages: [
        {
          role: 'system',
          content: SYSTEM_INSTRUCTION,
        },
        {
          role: 'user',
          content: JSON.stringify({
            text,
          }),
        },
      ],
    });
    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Groq semantic inference returned no structured content.');
    }
    return content;
  }
}

function createGroqSemanticModelClient({ apiKey, model } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new TypeError('A Groq API key is required.');
  }
  return new GroqSemanticModelClient({
    client: new Groq({ apiKey: apiKey.trim() }),
    model,
  });
}

const SYSTEM_INSTRUCTION = [
  'You are the natural-language understanding layer for an Arabic clinic assistant.',
  'Classify meaning only and return exactly one SemanticUnderstandingResult version 1 JSON object matching the supplied strict schema. Always include every required object field and every required array even when empty. Never omit corrections, mentions, signals, or ambiguity fields.',
  'Intent boundaries: booking requests a new appointment. availability_request asks for open appointment slots. working_hours asks when the clinic operates. appointment_query concerns an existing appointment. appointment_cancellation, appointment_reschedule, appointment_change_service, appointment_change_branch, and appointment_change_provider describe the corresponding management goal.',
  'Social and stance boundaries: courtesy is praise, thanks, or polite interpersonal appreciation, including praise expressed as a rhetorical question. Courtesy takes precedence over small_talk whenever a positive evaluation or appreciation is expressed; grammatical question form does not remove the praise meaning. small_talk is casual conversation not better represented by another social intent. objection is prospective resistance or concern about proceeding, including price or value concerns. complaint reports dissatisfaction with an experienced service, outcome, interaction, delay, failure, or treatment. hesitation is uncertainty, reluctance, or a desire to think or wait without a substantive objection. Objection and complaint are distinct: do not set complaint merely because an objection is negative, and do not set both unless the user explicitly communicates both meanings.',
  'medical_question covers treatment preparation, aftercare, effects, suitability, recovery, symptoms, or medically framed comparisons. It never supplies medical facts. human_handover_request means asking to communicate with clinic staff or a human. A staff handoff is not booking and is not a provider preference; providerMentions are only for a clinician the user wants to receive care from.',
  'knowledgeTopic is a bounded meaning classification for approved medical knowledge: preparation means actions or requirements before treatment; aftercare means actions or expectations after treatment; comparison means comparing treatments. Questions about pain, effects, suitability, symptoms, duration, or general information are not preparation, aftercare, or comparison unless that meaning is independently present, so use null. Set a topic only for medical_question when one bounded meaning is clear.',
  'Use secondaryIntents only for additional explicit goals. Mark conditional when one goal depends on another. Any explicit replacement, negation-and-replacement, or correction of a service, branch, provider, or date must set signals.correction true, use conversationAct correction, include the corresponding corrections entry, and use the matching appointment_change intent even when the surrounding appointment is implicit.',
  'Safety signals classify language only. Set medicalRisk conservatively when the user reports their own symptom, unexpected treatment effect, worsening or severe problem, or another patient-specific concern that may require clinic or professional review instead of ordinary FAQ handling. A general or hypothetical question about whether a treatment is painful, risky, or has effects is medicalQuestion but not medicalRisk unless the user reports an actual problem. Do not diagnose severity or provide advice. legalEscalation is legal or regulatory escalation; abuseOrThreat is abusive or threatening language; humanHandover requests a person.',
  'Do not answer, recommend, invent facts or identifiers, choose actions, authorize ownership, or execute anything.',
  'Extract every explicitly named treatment or service as a serviceMention. For every entity mention, text is the surface span: copy an exact contiguous substring from the user message, preserving the letters actually present. With attached Arabic clitics, copy a smaller bare substring that truly occurs; never reconstruct a definite form or add omitted letters. If no shorter exact span can be guaranteed, the entire exact user message is an allowed anchored surface span. concept is a concise normalized semantic label in the same language and script as the surface span when possible. It need not be a literal substring, but it must stay at the same or a more general level than the surface span. Never specialize a generic treatment or service into a subtype, purpose, technology, body area, or catalog item not explicitly established by the message. Do not create serviceMentions for generic class words such as an unnamed service, staff, or reception. The model does not resolve clinic catalog identity. Never output an identifier. Use empty arrays and null when no entity is present.',
  'Use unknown only when no supported intent is established. A context-dependent deictic follow-up with no supplied referent must be unknown with requiresClarification true and reason reference_unclear; it is not small_talk. For any genuine context-dependent or conflicting meaning, set requiresClarification true and choose a non-none reason. When requiresClarification is false, reason must be none. candidateIntents may contain only supported non-unknown intent values; use an empty array when no supported candidate exists. Do not put unknown in candidateIntents.',
].join(' ');

module.exports = GroqSemanticModelClient;
module.exports.createGroqSemanticModelClient = createGroqSemanticModelClient;
