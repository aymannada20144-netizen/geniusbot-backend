'use strict';

class OutboxPublisher {
  constructor(outboxRepository, eventBus) {
    if (!outboxRepository || typeof outboxRepository.findUnpublished !== 'function') {
      throw new TypeError('OutboxPublisher requires outboxRepository.findUnpublished().');
    }
    if (!outboxRepository || typeof outboxRepository.markPublished !== 'function') {
      throw new TypeError('OutboxPublisher requires outboxRepository.markPublished().');
    }
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('OutboxPublisher requires eventBus.publish().');
    }
    this.outboxRepository = outboxRepository;
    this.eventBus = eventBus;
  }

  async publishPending() {
    const events = await this.outboxRepository.findUnpublished();
    const results = [];

    for (const event of events) {
      try {
        const publication = await this.eventBus.publish(
          event.event_name,
          event.payload
        );
        if (publication.failed === 0) {
          await this.outboxRepository.markPublished(event.id);
          results.push({ id: event.id, published: true });
        } else {
          results.push({ id: event.id, published: false });
        }
      } catch {
        results.push({ id: event.id, published: false });
      }
    }

    return results;
  }
}

module.exports = OutboxPublisher;
