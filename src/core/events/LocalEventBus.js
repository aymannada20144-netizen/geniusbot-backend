'use strict';

class LocalEventBus {
  constructor({ logger = null } = {}) {
    this.listeners = new Map();
    this.logger = logger;
  }

  subscribe(eventName, listener) {
    this.#validateEventName(eventName);

    if (typeof listener !== 'function') {
      throw new TypeError('Event listener must be a function.');
    }

    const eventListeners =
      this.listeners.get(eventName) || new Set();

    eventListeners.add(listener);
    this.listeners.set(eventName, eventListeners);

    let isSubscribed = true;

    return () => {
      if (!isSubscribed) {
        return false;
      }

      isSubscribed = false;

      return this.unsubscribe(eventName, listener);
    };
  }

  unsubscribe(eventName, listener) {
    this.#validateEventName(eventName);

    if (typeof listener !== 'function') {
      throw new TypeError('Event listener must be a function.');
    }

    const eventListeners = this.listeners.get(eventName);

    if (!eventListeners) {
      return false;
    }

    const wasRemoved = eventListeners.delete(listener);

    if (eventListeners.size === 0) {
      this.listeners.delete(eventName);
    }

    return wasRemoved;
  }

  async publish(eventName, payload = null) {
    this.#validateEventName(eventName);

    const eventListeners = [
      ...(this.listeners.get(eventName) || []),
    ];

    if (eventListeners.length === 0) {
      return {
        eventName,
        listenerCount: 0,
        succeeded: 0,
        failed: 0,
        results: [],
        errors: [],
      };
    }

    const executions = eventListeners.map(
      async (listener, listenerIndex) => {
        try {
          const value = await listener(payload, {
            eventName,
            listenerIndex,
          });

          return {
            status: 'fulfilled',
            listenerIndex,
            value,
          };
        } catch (error) {
          this.#logListenerFailure({
            eventName,
            listenerIndex,
            error,
          });

          return {
            status: 'rejected',
            listenerIndex,
            error,
          };
        }
      }
    );

    const settledExecutions = await Promise.all(executions);

    const results = settledExecutions.filter(
      (execution) => execution.status === 'fulfilled'
    );

    const errors = settledExecutions.filter(
      (execution) => execution.status === 'rejected'
    );

    return {
      eventName,
      listenerCount: eventListeners.length,
      succeeded: results.length,
      failed: errors.length,
      results,
      errors,
    };
  }

  listenerCount(eventName) {
    this.#validateEventName(eventName);

    return this.listeners.get(eventName)?.size || 0;
  }

  clear(eventName) {
    if (eventName === undefined) {
      const removedEventCount = this.listeners.size;

      this.listeners.clear();

      return removedEventCount;
    }

    this.#validateEventName(eventName);

    return this.listeners.delete(eventName);
  }

  #validateEventName(eventName) {
    if (
      typeof eventName !== 'string' ||
      eventName.trim() === ''
    ) {
      throw new TypeError(
        'Event name must be a non-empty string.'
      );
    }
  }

  #logListenerFailure({
    eventName,
    listenerIndex,
    error,
  }) {
    if (!this.logger) {
      return;
    }

    const logPayload = {
      eventName,
      listenerIndex,
      error,
    };

    if (typeof this.logger.error === 'function') {
      this.logger.error(
        logPayload,
        'Local event listener failed.'
      );

      return;
    }

    if (typeof this.logger.log === 'function') {
      this.logger.log(
        'Local event listener failed.',
        logPayload
      );
    }
  }
}

module.exports = LocalEventBus;