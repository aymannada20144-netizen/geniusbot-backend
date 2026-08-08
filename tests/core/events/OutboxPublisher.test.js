'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const LocalEventBus = require('../../../src/core/events/LocalEventBus');
const OutboxPublisher = require('../../../src/core/events/OutboxPublisher');

function createHarness(events) {
  const marked = [];
  const repository = {
    findUnpublished: async () => events,
    markPublished: async (id) => {
      marked.push(id);
      return { id };
    },
  };
  const eventBus = new LocalEventBus();
  return {
    publisher: new OutboxPublisher(repository, eventBus),
    eventBus,
    marked,
  };
}

test('marks an event published after successful publication', async () => {
  const { publisher, eventBus, marked } = createHarness([
    { id: 'event-1', event_name: 'event', payload: { value: 1 } },
  ]);
  eventBus.subscribe('event', async () => {});

  assert.deepEqual(await publisher.publishPending(), [
    { id: 'event-1', published: true },
  ]);
  assert.deepEqual(marked, ['event-1']);
});

test('leaves an event unpublished when a listener fails', async () => {
  const { publisher, eventBus, marked } = createHarness([
    { id: 'event-1', event_name: 'event', payload: {} },
  ]);
  eventBus.subscribe('event', async () => { throw new Error('failed'); });

  await publisher.publishPending();
  assert.deepEqual(marked, []);
});

test('leaves an event unpublished when publish throws', async () => {
  const events = [{ id: 'event-1', event_name: 'event', payload: {} }];
  const marked = [];
  const publisher = new OutboxPublisher(
    {
      findUnpublished: async () => events,
      markPublished: async (id) => marked.push(id),
    },
    { publish: async () => { throw new Error('publish failed'); } }
  );

  await publisher.publishPending();
  assert.deepEqual(marked, []);
});

test('publishes multiple events in repository order', async () => {
  const { publisher, eventBus, marked } = createHarness([
    { id: 'first', event_name: 'event', payload: { order: 1 } },
    { id: 'second', event_name: 'event', payload: { order: 2 } },
  ]);
  const received = [];
  eventBus.subscribe('event', async (payload) => received.push(payload.order));

  await publisher.publishPending();
  assert.deepEqual(received, [1, 2]);
  assert.deepEqual(marked, ['first', 'second']);
});

test('marks an event published when there are no subscribers', async () => {
  const { publisher, marked } = createHarness([
    { id: 'event-1', event_name: 'event', payload: {} },
  ]);

  await publisher.publishPending();
  assert.deepEqual(marked, ['event-1']);
});
