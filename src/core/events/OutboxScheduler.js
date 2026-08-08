'use strict';

const INTERVAL_MS = 5000;

class OutboxScheduler {
  constructor(outboxPublisher, { logger = console } = {}) {
    if (!outboxPublisher || typeof outboxPublisher.publishPending !== 'function') {
      throw new TypeError('OutboxScheduler requires outboxPublisher.publishPending().');
    }
    this.outboxPublisher = outboxPublisher;
    this.logger = logger;
    this.timer = null;
    this.isRunning = false;
  }

  start() {
    if (this.timer) return false;
    this.timer = setInterval(() => {
      this.runOnce().catch((error) => {
        this.logger.error?.('Outbox scheduler cycle failed.', error);
      });
    }, INTERVAL_MS);
    this.timer.unref?.();
    return true;
  }

  stop() {
    if (!this.timer) return false;
    clearInterval(this.timer);
    this.timer = null;
    return true;
  }

  async runOnce() {
    if (this.isRunning) return { skipped: true, reason: 'already_running' };
    this.isRunning = true;
    try {
      return {
        skipped: false,
        results: await this.outboxPublisher.publishPending(),
      };
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = OutboxScheduler;
