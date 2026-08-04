'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  LocalEventBus,
} = require('../../src/core/events');

describe('LocalEventBus', () => {
  test('publishes an event to its subscribed listener', async () => {
    const eventBus = new LocalEventBus();
    const receivedPayloads = [];

    eventBus.subscribe('TEST_EVENT', async (payload) => {
      receivedPayloads.push(payload);

      return 'handled';
    });

    const result = await eventBus.publish(
      'TEST_EVENT',
      {
        appointmentId: 'appointment-1',
      }
    );

    assert.deepEqual(receivedPayloads, [
      {
        appointmentId: 'appointment-1',
      },
    ]);

    assert.equal(result.eventName, 'TEST_EVENT');
    assert.equal(result.listenerCount, 1);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.results[0].value, 'handled');
  });

  test('supports multiple listeners for the same event', async () => {
    const eventBus = new LocalEventBus();
    const calls = [];

    eventBus.subscribe('TEST_EVENT', async () => {
      calls.push('first');
    });

    eventBus.subscribe('TEST_EVENT', async () => {
      calls.push('second');
    });

    const result = await eventBus.publish('TEST_EVENT');

    assert.deepEqual(calls.sort(), [
      'first',
      'second',
    ]);

    assert.equal(result.listenerCount, 2);
    assert.equal(result.succeeded, 2);
    assert.equal(result.failed, 0);
  });

  test('isolates listener failures from other listeners', async () => {
    const eventBus = new LocalEventBus();
    const successfulCalls = [];

    eventBus.subscribe('TEST_EVENT', async () => {
      throw new Error('Listener failure');
    });

    eventBus.subscribe('TEST_EVENT', async (payload) => {
      successfulCalls.push(payload);

      return 'success';
    });

    const result = await eventBus.publish(
      'TEST_EVENT',
      {
        value: 25,
      }
    );

    assert.deepEqual(successfulCalls, [
      {
        value: 25,
      },
    ]);

    assert.equal(result.listenerCount, 2);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 1);

    assert.equal(
      result.errors[0].error.message,
      'Listener failure'
    );
  });

  test('returns an unsubscribe function', async () => {
    const eventBus = new LocalEventBus();
    let callCount = 0;

    const unsubscribe = eventBus.subscribe(
      'TEST_EVENT',
      async () => {
        callCount += 1;
      }
    );

    await eventBus.publish('TEST_EVENT');

    assert.equal(callCount, 1);
    assert.equal(eventBus.listenerCount('TEST_EVENT'), 1);

    assert.equal(unsubscribe(), true);
    assert.equal(unsubscribe(), false);

    assert.equal(eventBus.listenerCount('TEST_EVENT'), 0);

    await eventBus.publish('TEST_EVENT');

    assert.equal(callCount, 1);
  });

  test('can unsubscribe a listener directly', () => {
    const eventBus = new LocalEventBus();

    const listener = async () => {};

    eventBus.subscribe('TEST_EVENT', listener);

    assert.equal(
      eventBus.unsubscribe('TEST_EVENT', listener),
      true
    );

    assert.equal(
      eventBus.unsubscribe('TEST_EVENT', listener),
      false
    );
  });

  test('returns an empty result when no listeners exist', async () => {
    const eventBus = new LocalEventBus();

    const result = await eventBus.publish(
      'UNUSED_EVENT',
      {
        value: 1,
      }
    );

    assert.deepEqual(result, {
      eventName: 'UNUSED_EVENT',
      listenerCount: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      errors: [],
    });
  });

  test('clears one event without affecting another event', () => {
    const eventBus = new LocalEventBus();

    eventBus.subscribe('FIRST_EVENT', async () => {});
    eventBus.subscribe('SECOND_EVENT', async () => {});

    assert.equal(eventBus.clear('FIRST_EVENT'), true);

    assert.equal(
      eventBus.listenerCount('FIRST_EVENT'),
      0
    );

    assert.equal(
      eventBus.listenerCount('SECOND_EVENT'),
      1
    );
  });

  test('clears all registered events', () => {
    const eventBus = new LocalEventBus();

    eventBus.subscribe('FIRST_EVENT', async () => {});
    eventBus.subscribe('SECOND_EVENT', async () => {});

    assert.equal(eventBus.clear(), 2);

    assert.equal(
      eventBus.listenerCount('FIRST_EVENT'),
      0
    );

    assert.equal(
      eventBus.listenerCount('SECOND_EVENT'),
      0
    );
  });

  test('rejects invalid event names', async () => {
    const eventBus = new LocalEventBus();

    assert.throws(
      () => eventBus.subscribe('', async () => {}),
      {
        name: 'TypeError',
        message:
          'Event name must be a non-empty string.',
      }
    );

    await assert.rejects(
      eventBus.publish('   '),
      {
        name: 'TypeError',
        message:
          'Event name must be a non-empty string.',
      }
    );
  });

  test('rejects non-function listeners', () => {
    const eventBus = new LocalEventBus();

    assert.throws(
      () =>
        eventBus.subscribe(
          'TEST_EVENT',
          'not-a-function'
        ),
      {
        name: 'TypeError',
        message:
          'Event listener must be a function.',
      }
    );
  });

  test('logs listener failures when a logger is provided', async () => {
    const loggedErrors = [];

    const eventBus = new LocalEventBus({
      logger: {
        error(payload, message) {
          loggedErrors.push({
            payload,
            message,
          });
        },
      },
    });

    eventBus.subscribe('TEST_EVENT', async () => {
      throw new Error('Expected failure');
    });

    const result = await eventBus.publish('TEST_EVENT');

    assert.equal(result.failed, 1);
    assert.equal(loggedErrors.length, 1);

    assert.equal(
      loggedErrors[0].message,
      'Local event listener failed.'
    );

    assert.equal(
      loggedErrors[0].payload.eventName,
      'TEST_EVENT'
    );

    assert.equal(
      loggedErrors[0].payload.error.message,
      'Expected failure'
    );
  });
});