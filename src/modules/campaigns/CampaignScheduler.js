'use strict';

class CampaignScheduler {
  constructor(service, options = {}) {
    if (!service || typeof service.runDueCampaigns !== 'function') {
      throw new TypeError('CampaignScheduler requires service.runDueCampaigns.');
    }
    this.service = service;
    this.intervalMs = options.intervalMs || 60_000;
    this.logger = options.logger || console;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.runOnce(), this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce() {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.service.runDueCampaigns();
    } catch (error) {
      this.logger.error({ err: error }, 'Campaign scheduler failed.');
      return 0;
    } finally {
      this.running = false;
    }
  }
}

module.exports = CampaignScheduler;
