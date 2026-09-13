'use strict';
class ShadenLatencyTrace {
  constructor({ logger = console, messageId } = {}) { this.logger = logger; this.messageId = messageId || null; this.started = Date.now(); this.stages = {}; }
  begin(stage) { this.stages[stage] = Date.now(); this.#log({ event: 'SHADEN_LATENCY_TRACE', messageId: this.messageId, stage, startedAt: this.stages[stage] }); }
  end(stage, extra = {}) { const endedAt = Date.now(); const startedAt = this.stages[stage] || null; this.#log({ event: 'SHADEN_LATENCY_TRACE', messageId: this.messageId, stage, startedAt, endedAt, durationMs: startedAt == null ? null : endedAt - startedAt, ...extra }); }
  summary(extra = {}) { this.#log({ event: 'SHADEN_LATENCY_SUMMARY', messageId: this.messageId, totalMs: Date.now() - this.started, ...extra }); }
  #log(entry) { try { this.logger.info?.(entry); } catch {} }
}
module.exports = ShadenLatencyTrace;
