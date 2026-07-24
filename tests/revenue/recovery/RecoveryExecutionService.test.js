'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const RecoveryExecutionService = require(
  '../../../src/modules/revenue/recovery/RecoveryExecutionService'
);
const RecoveryChannelRouter = require(
  '../../../src/modules/revenue/recovery/RecoveryChannelRouter'
);
const RecoveryMessageBuilder = require(
  '../../../src/modules/revenue/recovery/RecoveryMessageBuilder'
);
const {
  RecoveryExecutionError,
} = require(
  '../../../src/modules/revenue/recovery/errors/RecoveryExecutionError'
);
const {
  RecoveryPolicyError,
} = require(
  '../../../src/modules/revenue/recovery/errors/RecoveryPolicyError'
);
const {
  RECOVERY_CHANNEL,
} = require('../../../src/constants/recoveryChannel');

function createContext(overrides = {}) {
  const policyContext = Object.freeze({
    attempt: Object.freeze({ id: 'attempt-1' }),
    opportunity: Object.freeze({ id: 'opportunity-1' }),
    patient: Object.freeze({
      id: 'patient-1',
      phoneNumber: '+966500000001',
    }),
  });
  const messageContext = Object.freeze({
    channel: RECOVERY_CHANNEL.WHATSAPP,
    language: 'en',
    template: Object.freeze({
      id: 'template-1',
      body: 'Hello {{patientName}}',
    }),
    variables: Object.freeze({ patientName: 'Shaden' }),
    metadata: Object.freeze({
      correlationId: 'correlation-1',
      attempt: Object.freeze({ sequence: 1 }),
    }),
  });

  return Object.freeze({
    policyContext,
    messageContext,
    providers: Object.freeze({}),
    ...overrides,
  });
}

function createHarness(options = {}) {
  const log = [];
  const calls = {
    policy: [],
    builder: [],
    router: [],
    whatsapp: [],
    sms: [],
  };
  const providerResponse =
    options.providerResponse ??
    Object.freeze({
      accepted: true,
      providerMessageId: 'message-1',
    });

  const whatsappProvider = Object.freeze({
    async send(payload) {
      log.push('provider');
      calls.whatsapp.push(payload);
      if (Object.prototype.hasOwnProperty.call(options, 'providerFailure')) {
        throw options.providerFailure;
      }
      return providerResponse;
    },
  });
  const smsProvider = Object.freeze({
    async send(payload) {
      calls.sms.push(payload);
      return { accepted: true };
    },
  });
  const providers = Object.freeze({
    [RECOVERY_CHANNEL.WHATSAPP]: whatsappProvider,
    [RECOVERY_CHANNEL.SMS]: smsProvider,
  });
  const realBuilder = new RecoveryMessageBuilder();
  const realRouter = new RecoveryChannelRouter();
  const policy = Object.freeze({
    assertExecutionAllowed(context) {
      log.push('policy');
      calls.policy.push(context);
      if (options.policyFailure) {
        throw options.policyFailure;
      }
    },
  });
  const messageBuilder = Object.freeze({
    build(context) {
      log.push('builder');
      calls.builder.push(context);
      if (options.builderFailure) {
        throw options.builderFailure;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'builderResult')) {
        return options.builderResult;
      }
      return realBuilder.build(context);
    },
  });
  const channelRouter = Object.freeze({
    route(context) {
      log.push('router');
      calls.router.push(context);
      if (options.routerFailure) {
        throw options.routerFailure;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'routerResult')) {
        return options.routerResult;
      }
      return realRouter.route(context);
    },
  });

  return {
    calls,
    channelRouter,
    log,
    messageBuilder,
    policy,
    providerResponse,
    providers,
    smsProvider,
    whatsappProvider,
  };
}

function createService(harness) {
  return new RecoveryExecutionService({
    policy: harness.policy,
    messageBuilder: harness.messageBuilder,
    channelRouter: harness.channelRouter,
  });
}

function assertNoSend(harness) {
  assert.equal(harness.calls.whatsapp.length, 0);
  assert.equal(harness.calls.sms.length, 0);
}

describe('RecoveryExecutionService', () => {
  test('executes WhatsApp policy, build, route, and one send in order without mutating input', async () => {
    const harness = createHarness();
    const service = createService(harness);
    const context = createContext({ providers: harness.providers });

    const result = await service.execute(context);

    assert.deepEqual(harness.log, [
      'policy',
      'builder',
      'router',
      'provider',
    ]);
    assert.deepEqual(
      {
        policy: harness.calls.policy.length,
        builder: harness.calls.builder.length,
        router: harness.calls.router.length,
        whatsapp: harness.calls.whatsapp.length,
        sms: harness.calls.sms.length,
      },
      { policy: 1, builder: 1, router: 1, whatsapp: 1, sms: 0 }
    );
    assert.equal(harness.calls.policy[0], context.policyContext);
    assert.equal(harness.calls.builder[0], context.messageContext);
    assert.equal(harness.calls.router[0].providers, harness.providers);

    const routedPayload = harness.calls.router[0].payload;
    assert.equal(routedPayload.channel, RECOVERY_CHANNEL.WHATSAPP);
    assert.equal(routedPayload.body, 'Hello Shaden');
    assert.equal(
      routedPayload.recipient,
      context.policyContext.patient.phoneNumber
    );
    assert.equal(harness.calls.whatsapp[0], routedPayload);
    assert.ok(Object.isFrozen(routedPayload));
    assert.deepEqual(result, {
      attemptId: 'attempt-1',
      opportunityId: 'opportunity-1',
      channel: RECOVERY_CHANNEL.WHATSAPP,
      providerResponse: harness.providerResponse,
    });
    assert.equal(result.providerResponse, harness.providerResponse);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(context));
    assert.ok(Object.isFrozen(context.policyContext));
    assert.ok(Object.isFrozen(context.messageContext));
    assert.ok(Object.isFrozen(context.providers));
    assert.equal(context.messageContext.channel, RECOVERY_CHANNEL.WHATSAPP);
    assert.equal(
      Object.hasOwn(context.messageContext, 'recipient'),
      false
    );
  });

  test('preserves a non-WhatsApp builder payload reference through routing and sending', async () => {
    const payload = Object.freeze({
      channel: RECOVERY_CHANNEL.EMAIL,
      body: 'Email body',
    });
    const calls = [];
    const providerResponse = Object.freeze({ accepted: true });
    const emailProvider = Object.freeze({
      async send(value) {
        calls.push(value);
        return providerResponse;
      },
    });
    const providers = Object.freeze({
      [RECOVERY_CHANNEL.EMAIL]: emailProvider,
    });
    const policy = { assertExecutionAllowed() {} };
    const messageBuilder = { build: () => payload };
    const router = new RecoveryChannelRouter();
    const channelRouter = {
      route(context) {
        assert.equal(context.payload, payload);
        return router.route(context);
      },
    };
    const service = new RecoveryExecutionService({
      policy,
      messageBuilder,
      channelRouter,
    });
    const context = createContext({
      messageContext: Object.freeze({ channel: RECOVERY_CHANNEL.EMAIL }),
      providers,
    });

    const result = await service.execute(context);

    assert.equal(calls.length, 1);
    assert.equal(calls[0], payload);
    assert.equal(result.channel, RECOVERY_CHANNEL.EMAIL);
    assert.equal(result.providerResponse, providerResponse);
  });

  test('validates execution input before policy evaluation or any send', async () => {
    const invalidContexts = [
      undefined,
      null,
      [],
      'context',
      {},
      { policyContext: {}, messageContext: {} },
    ];

    for (const context of invalidContexts) {
      const harness = createHarness();
      const service = createService(harness);

      await assert.rejects(service.execute(context), TypeError);
      assert.equal(harness.calls.policy.length, 0);
      assert.equal(harness.calls.builder.length, 0);
      assert.equal(harness.calls.router.length, 0);
      assertNoSend(harness);
    }
  });

  test('does not build, route, or send when policy throws or denies execution', async () => {
    const failures = [
      new Error('policy dependency failed'),
      new RecoveryPolicyError('Suppressed.', {
        reason: 'PATIENT_OPTED_OUT',
        policy: 'RECOVERY_CONSENT',
      }),
      new RecoveryPolicyError('Outside window.', {
        reason: 'RECOVERY_WINDOW_EXPIRED',
        policy: 'RECOVERY_WINDOW',
      }),
      new RecoveryPolicyError('Maximum attempts reached.', {
        reason: 'MAX_ATTEMPTS_REACHED',
        policy: 'RECOVERY_ATTEMPT_LIMIT',
      }),
      new RecoveryPolicyError('Opportunity closed.', {
        reason: 'OPPORTUNITY_NOT_RECOVERABLE',
        policy: 'RECOVERY_OPPORTUNITY_STATE',
      }),
    ];

    for (const failure of failures) {
      const harness = createHarness({ policyFailure: failure });
      const service = createService(harness);
      const context = createContext({ providers: harness.providers });

      await assert.rejects(
        service.execute(context),
        (error) => error === failure
      );
      assert.equal(harness.calls.policy.length, 1);
      assert.equal(harness.calls.builder.length, 0);
      assert.equal(harness.calls.router.length, 0);
      assertNoSend(harness);
    }
  });

  test('does not route or send when message building throws or returns an invalid payload', async () => {
    const failures = [
      { builderFailure: new Error('build failed') },
      { builderResult: null },
      { builderResult: [] },
      { builderResult: {} },
      { builderResult: { channel: '' } },
    ];

    for (const options of failures) {
      const harness = createHarness(options);
      const service = createService(harness);
      const context = createContext({ providers: harness.providers });

      await assert.rejects(service.execute(context));
      assert.equal(harness.calls.policy.length, 1);
      assert.equal(harness.calls.builder.length, 1);
      assert.equal(harness.calls.router.length, 0);
      assertNoSend(harness);
    }
  });

  test('does not send when routing throws, channel is unsupported, or registration is missing', async () => {
    const cases = [
      {
        options: { routerFailure: new Error('route failed') },
        providers: null,
      },
      {
        options: {
          builderResult: Object.freeze({ channel: 'telegram' }),
        },
        providers: null,
      },
      {
        options: {},
        providers: Object.freeze({}),
      },
    ];

    for (const entry of cases) {
      const harness = createHarness(entry.options);
      const service = createService(harness);
      const context = createContext({
        providers: entry.providers ?? harness.providers,
      });

      await assert.rejects(service.execute(context));
      assert.equal(harness.calls.policy.length, 1);
      assert.equal(harness.calls.builder.length, 1);
      assert.equal(harness.calls.router.length, 1);
      assertNoSend(harness);
    }
  });

  test('does not send when the router returns an invalid route or provider', async () => {
    const payload = Object.freeze({
      channel: RECOVERY_CHANNEL.SMS,
    });
    const invalidRoutes = [
      null,
      [],
      {},
      { provider: {}, payload },
      { provider: { send() {} }, payload: {} },
    ];

    for (const routerResult of invalidRoutes) {
      const harness = createHarness({
        builderResult: payload,
        routerResult,
      });
      const service = createService(harness);
      const context = createContext({ providers: harness.providers });

      await assert.rejects(service.execute(context), TypeError);
      assert.equal(harness.calls.router.length, 1);
      assertNoSend(harness);
    }
  });

  test('normalizes Error, primitive, retryable, and non-retryable provider failures exactly once', async () => {
    const failures = [
      { cause: new Error('provider unavailable'), retryable: false },
      { cause: 'provider unavailable', retryable: false },
      {
        cause: Object.assign(new Error('temporary failure'), {
          retryable: true,
        }),
        retryable: true,
      },
      {
        cause: Object.assign(new Error('permanent failure'), {
          retryable: false,
        }),
        retryable: false,
      },
    ];

    for (const failure of failures) {
      const harness = createHarness({
        providerFailure: failure.cause,
      });
      const service = createService(harness);
      const context = createContext({ providers: harness.providers });

      await assert.rejects(
        service.execute(context),
        (error) => {
          assert.ok(error instanceof RecoveryExecutionError);
          assert.equal(error.code, 'RECOVERY_EXECUTION_ERROR');
          assert.equal(error.cause, failure.cause);
          assert.equal(error.details.reason, 'PROVIDER_SEND_FAILED');
          assert.equal(error.details.operation, 'send');
          assert.equal(error.details.attemptId, 'attempt-1');
          assert.equal(error.details.opportunityId, 'opportunity-1');
          assert.equal(error.details.channel, RECOVERY_CHANNEL.WHATSAPP);
          assert.equal(error.details.retryable, failure.retryable);
          assert.equal(error.isRetryable(), failure.retryable);
          assert.equal(error.retryable, failure.retryable);
          assert.equal(
            JSON.stringify(error.details).includes('+966500000001'),
            false
          );
          assert.equal(
            JSON.stringify(error.details).includes('access_token'),
            false
          );
          return true;
        }
      );
      assert.deepEqual(harness.log, [
        'policy',
        'builder',
        'router',
        'provider',
      ]);
      assert.equal(harness.calls.whatsapp.length, 1);
      assert.equal(harness.calls.sms.length, 0);
    }
  });

  test('returns the provider response unchanged even when it reports failure', async () => {
    const providerResponse = Object.freeze({
      success: false,
      retryable: true,
      failureReason: 'rate_limited',
    });
    const harness = createHarness({ providerResponse });
    const service = createService(harness);
    const context = createContext({ providers: harness.providers });

    const result = await service.execute(context);

    assert.equal(result.providerResponse, providerResponse);
    assert.equal(harness.calls.whatsapp.length, 1);
    assert.equal(harness.calls.sms.length, 0);
  });
});
