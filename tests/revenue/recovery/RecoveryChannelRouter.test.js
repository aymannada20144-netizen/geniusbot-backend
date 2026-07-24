'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const RecoveryChannelRouter = require(
  '../../../src/modules/revenue/recovery/RecoveryChannelRouter'
);
const {
  RecoveryChannelRoutingError,
} = require(
  '../../../src/modules/revenue/recovery/errors/RecoveryChannelRoutingError'
);
const {
  RECOVERY_CHANNEL,
} = require('../../../src/constants/recoveryChannel');

function assertRoutingError(error, reason, channel) {
  assert.ok(error instanceof RecoveryChannelRoutingError);
  assert.equal(error.code, 'RECOVERY_CHANNEL_ROUTING_ERROR');
  assert.deepEqual(error.details, { reason, channel });
  return true;
}

function validContext(overrides = {}) {
  const provider = Object.freeze({
    send() {
      throw new Error('Routing must not invoke the provider.');
    },
  });
  const payload = Object.freeze({
    channel: RECOVERY_CHANNEL.WHATSAPP,
    body: 'Hello',
  });
  const providers = Object.freeze({
    [RECOVERY_CHANNEL.WHATSAPP]: provider,
  });

  return {
    context: Object.freeze({
      payload,
      providers,
      ...overrides,
    }),
    payload,
    provider,
    providers,
  };
}

describe('RecoveryChannelRouter', () => {
  test('routes synchronously, deterministically, and without invoking or mutating collaborators', () => {
    const router = new RecoveryChannelRouter();
    let sends = 0;
    const provider = Object.freeze({
      send() {
        sends += 1;
      },
    });
    const payload = Object.freeze({
      channel: RECOVERY_CHANNEL.WHATSAPP,
      body: 'Hello',
    });
    const providers = Object.freeze({
      [RECOVERY_CHANNEL.WHATSAPP]: provider,
    });
    const context = Object.freeze({ payload, providers });

    const first = router.route(context);
    const second = router.route(context);

    assert.equal(first.provider, provider);
    assert.equal(first.payload, payload);
    assert.equal(second.provider, provider);
    assert.equal(second.payload, payload);
    assert.equal(first.payload.channel, RECOVERY_CHANNEL.WHATSAPP);
    assert.equal(sends, 0);
    assert.equal(typeof first.then, 'undefined');
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(context));
    assert.ok(Object.isFrozen(payload));
    assert.ok(Object.isFrozen(providers));
    assert.ok(Object.isFrozen(provider));
  });

  test('supports function providers and returns the registered reference', () => {
    const router = new RecoveryChannelRouter();
    function provider() {}
    provider.send = () => {};
    const payload = { channel: RECOVERY_CHANNEL.SMS };
    const providers = { [RECOVERY_CHANNEL.SMS]: provider };

    const route = router.route({ payload, providers });

    assert.equal(route.provider, provider);
    assert.equal(route.payload, payload);
  });

  test('does not normalize, trim, change case, or replace channel values', () => {
    const router = new RecoveryChannelRouter();
    const values = [' WhatsApp ', 'WHATSAPP', 'Whatsapp'];

    for (const channel of values) {
      const payload = Object.freeze({ channel });
      const providers = Object.freeze({});

      assert.throws(
        () => router.route(Object.freeze({ payload, providers })),
        (error) => assertRoutingError(error, 'UNKNOWN_CHANNEL', channel)
      );
      assert.equal(payload.channel, channel);
    }
  });

  test('rejects missing, null, primitive, array, and non-plain contexts in order', () => {
    const router = new RecoveryChannelRouter();
    const invalidContexts = [
      undefined,
      null,
      'context',
      [],
      new (class Context {})(),
    ];

    for (const context of invalidContexts) {
      assert.throws(
        () => router.route(context),
        (error) =>
          error instanceof TypeError &&
          /"context" must be a plain object/.test(error.message)
      );
    }
  });

  test('rejects missing or invalid payload before inspecting providers', () => {
    const router = new RecoveryChannelRouter();
    const invalidPayloads = [
      undefined,
      null,
      [],
      'payload',
      new (class Payload {})(),
    ];

    for (const payload of invalidPayloads) {
      let providersGetterCalls = 0;
      const context = { payload };
      Object.defineProperty(context, 'providers', {
        get() {
          providersGetterCalls += 1;
          return {};
        },
      });

      assert.throws(
        () => router.route(context),
        (error) =>
          error instanceof TypeError &&
          /"context\.payload" must be a plain object/.test(error.message)
      );
      assert.equal(providersGetterCalls, 0);
    }
  });

  test('rejects missing or invalid providers', () => {
    const router = new RecoveryChannelRouter();
    const payload = { channel: RECOVERY_CHANNEL.WHATSAPP };
    const invalidProviders = [
      undefined,
      null,
      [],
      'providers',
      new (class Providers {})(),
    ];

    for (const providers of invalidProviders) {
      assert.throws(
        () => router.route({ payload, providers }),
        (error) =>
          error instanceof TypeError &&
          /"context\.providers" must be a plain object/.test(error.message)
      );
    }
  });

  test('rejects missing and inherited channel properties without reading them', () => {
    const router = new RecoveryChannelRouter();
    let inheritedGetterCalls = 0;
    Object.defineProperty(Object.prototype, 'channel', {
      configurable: true,
      get() {
        inheritedGetterCalls += 1;
        return RECOVERY_CHANNEL.WHATSAPP;
      },
    });

    try {
      assert.throws(
        () => router.route({ payload: {}, providers: {} }),
        (error) =>
          error instanceof TypeError &&
          /payload\.channel must be an own property/.test(error.message)
      );
    } finally {
      delete Object.prototype.channel;
    }
    assert.equal(inheritedGetterCalls, 0);
  });

  test('rejects accessor channel properties without invoking the getter', () => {
    const router = new RecoveryChannelRouter();
    let getterCalls = 0;
    const payload = {};
    Object.defineProperty(payload, 'channel', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return RECOVERY_CHANNEL.WHATSAPP;
      },
    });

    assert.throws(
      () => router.route({ payload, providers: {} }),
      (error) =>
        error instanceof TypeError &&
        /payload\.channel must be a data property/.test(error.message)
    );
    assert.equal(getterCalls, 0);
  });

  test('rejects non-string, empty, and whitespace-only channels', () => {
    const router = new RecoveryChannelRouter();

    for (const channel of [null, 1, {}, []]) {
      assert.throws(
        () => router.route({ payload: { channel }, providers: {} }),
        (error) =>
          error instanceof TypeError &&
          /payload\.channel must be a string/.test(error.message)
      );
    }

    for (const channel of ['', ' ', '\t\n']) {
      assert.throws(
        () => router.route({ payload: { channel }, providers: {} }),
        (error) =>
          error instanceof TypeError &&
          /payload\.channel must not be empty/.test(error.message)
      );
    }
  });

  test('rejects unsupported channels before provider lookup', () => {
    const router = new RecoveryChannelRouter();
    let providerGetterCalls = 0;
    const providers = {};
    Object.defineProperty(providers, 'telegram', {
      get() {
        providerGetterCalls += 1;
        return { send() {} };
      },
    });

    assert.throws(
      () =>
        router.route({
          payload: { channel: 'telegram' },
          providers,
        }),
      (error) =>
        assertRoutingError(error, 'UNKNOWN_CHANNEL', 'telegram')
    );
    assert.equal(providerGetterCalls, 0);
  });

  test('rejects missing and inherited provider registrations', () => {
    const router = new RecoveryChannelRouter();
    const channel = RECOVERY_CHANNEL.WHATSAPP;

    assert.throws(
      () => router.route({ payload: { channel }, providers: {} }),
      (error) =>
        assertRoutingError(error, 'PROVIDER_NOT_REGISTERED', channel)
    );

    Object.defineProperty(Object.prototype, channel, {
      configurable: true,
      value: { send() {} },
    });
    try {
      assert.throws(
        () => router.route({ payload: { channel }, providers: {} }),
        (error) =>
          assertRoutingError(error, 'PROVIDER_NOT_REGISTERED', channel)
      );
    } finally {
      delete Object.prototype[channel];
    }
  });

  test('rejects accessor provider registrations without invoking the getter', () => {
    const router = new RecoveryChannelRouter();
    const channel = RECOVERY_CHANNEL.WHATSAPP;
    let getterCalls = 0;
    const providers = {};
    Object.defineProperty(providers, channel, {
      enumerable: true,
      get() {
        getterCalls += 1;
        return { send() {} };
      },
    });

    assert.throws(
      () => router.route({ payload: { channel }, providers }),
      (error) =>
        assertRoutingError(error, 'INVALID_PROVIDER', channel)
    );
    assert.equal(getterCalls, 0);
  });

  test('rejects invalid provider values and invalid send contracts', () => {
    const router = new RecoveryChannelRouter();
    const channel = RECOVERY_CHANNEL.WHATSAPP;
    const invalidProviders = [null, undefined, 1, 'provider', {}, { send: 1 }];

    for (const provider of invalidProviders) {
      assert.throws(
        () =>
          router.route({
            payload: { channel },
            providers: { [channel]: provider },
          }),
        (error) =>
          assertRoutingError(error, 'INVALID_PROVIDER', channel)
      );
    }
  });

  test('rejects accessor send properties without invoking the getter', () => {
    const router = new RecoveryChannelRouter();
    const channel = RECOVERY_CHANNEL.WHATSAPP;
    let getterCalls = 0;
    const provider = {};
    Object.defineProperty(provider, 'send', {
      get() {
        getterCalls += 1;
        return () => {};
      },
    });

    assert.throws(
      () =>
        router.route({
          payload: { channel },
          providers: { [channel]: provider },
        }),
      (error) =>
        assertRoutingError(error, 'INVALID_PROVIDER', channel)
    );
    assert.equal(getterCalls, 0);
  });

  test('accepts a callable inherited send data property without invoking it', () => {
    const router = new RecoveryChannelRouter();
    const channel = RECOVERY_CHANNEL.WHATSAPP;
    let sends = 0;
    const prototype = {
      send() {
        sends += 1;
      },
    };
    const provider = Object.create(prototype);

    const route = router.route({
      payload: { channel },
      providers: { [channel]: provider },
    });

    assert.equal(route.provider, provider);
    assert.equal(sends, 0);
  });
});
