'use strict';

class NotificationScheduler {
  constructor(notificationService, { intervalMs = 60000, logger = console } = {}) {
    if (!notificationService || typeof notificationService.processDue !== 'function') {
      throw new TypeError('NotificationScheduler requires notificationService.processDue().');
    }
    this.notificationService = notificationService;
    this.intervalMs = intervalMs;
    this.logger = logger;
    this.timer = null;
    this.isRunning = false;
  }

  start() {
    if (this.timer) return false;
    this.logger.info?.('Notification scheduler started.', { intervalMs: this.intervalMs });
    this.timer = setInterval(() => {
      this.runOnce().catch((error) => {
        this.logger.error?.('Notification scheduler cycle failed.', error);
      });
    }, this.intervalMs);
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
      const results = await this.notificationService.processDue();
      if (results.length > 0) {
        this.logger.info?.('Notification scheduler processed reminders.', {
          count: results.length,
          failed: results.filter((result) => !result.sent).length,
        });
      }
      return { skipped: false, results };
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = NotificationScheduler;
