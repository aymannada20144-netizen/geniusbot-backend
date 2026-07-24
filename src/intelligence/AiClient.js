'use strict';

const Groq = require('groq-sdk');
const env = require('../config/env');

class AiClient {
  constructor() {
    this.client = new Groq({ apiKey: env.groqApiKey });
  }

  async reply({ patientName, messages, message }) {
    const history = messages.slice(-12).map((item) => ({
      role: item.senderType === 'patient' ? 'user' : 'assistant',
      content: item.messageText,
    }));
    const completion = await this.client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      messages: [
        { role: 'system', content: `You are Shaden, a concise Arabic-speaking clinic receptionist. Patient: ${patientName || 'unknown'}.` },
        ...history,
        { role: 'user', content: message },
      ],
    });
    const reply = completion.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('Shaden returned an empty response.');
    return reply;
  }
}

module.exports = AiClient;
