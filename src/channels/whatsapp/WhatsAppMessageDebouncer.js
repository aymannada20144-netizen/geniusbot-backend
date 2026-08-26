'use strict';

class WhatsAppMessageDebouncer {
  constructor({ target, windowMs = 2750, setTimer = setTimeout, clearTimer = clearTimeout, logger = console } = {}) {
    if (typeof target?.processMessage !== 'function') throw new TypeError('Debouncer requires target.processMessage().');
    if (!Number.isInteger(windowMs) || windowMs < 0) throw new TypeError('windowMs must be a non-negative integer.');
    this.target = target; this.windowMs = windowMs; this.setTimer = setTimer; this.clearTimer = clearTimer; this.logger = logger; this.pending = new Map();
  }

  processMessage(message) {
    if (message?.inputProvenance?.trusted === true || message?.messageType === 'button' || message?.messageType === 'interactive') {
      this.#log({
        event: 'SHADEN_DEBOUNCE',
        correlationId: message?.waMessageId || null,
        entered: false,
        aggregatedMessageCount: 1,
      });
      return this.target.processMessage(message);
    }
    const key = `${message?.metaPhoneNumberId || message?.receiverPhone || ''}:${message?.senderPhone || ''}`;
    return new Promise((resolve, reject) => {
      const entry = this.pending.get(key) || { messages: [], waiters: [], timer: null };
      entry.messages.push(message); entry.waiters.push({ resolve, reject });
      if (entry.timer) this.clearTimer(entry.timer);
      entry.timer = this.setTimer(() => this.#flush(key), this.windowMs);
      this.pending.set(key, entry);
    });
  }

  async #flush(key) {
    const entry = this.pending.get(key);
    if (!entry) return;
    this.pending.delete(key);
    const last = entry.messages[entry.messages.length - 1];
    const combined = { ...last, text: entry.messages.map((item) => item.text).filter(Boolean).join('\n'), aggregationCount: entry.messages.length, aggregatedMessageIds: entry.messages.map((item) => item.waMessageId) };
    this.#log({
      event: 'SHADEN_DEBOUNCE',
      correlationId: last?.waMessageId || null,
      entered: true,
      aggregatedMessageCount: entry.messages.length,
    });
    try { const result = await this.target.processMessage(combined); entry.waiters.forEach(({ resolve }) => resolve(result)); }
    catch (error) { entry.waiters.forEach(({ reject }) => reject(error)); }
  }

  #log(entry) { if (typeof this.logger?.info === 'function') this.logger.info(entry); }
}

module.exports = WhatsAppMessageDebouncer;
