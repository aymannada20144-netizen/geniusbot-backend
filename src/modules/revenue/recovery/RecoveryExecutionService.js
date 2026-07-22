'use strict';

const {
  RecoveryExecutionError,
} = require('./errors/RecoveryExecutionError');

const {
  RECOVERY_CHANNEL,
} = require('../../../constants/recoveryChannel');

/**
 * Orchestrates policy validation, message construction, provider routing,
 * and one provider send without owning persistence or lifecycle changes.
 */
class RecoveryExecutionService {
  /**
   * @param {object} dependencies
   * @param {object} dependencies.policy
   * @param {object} dependencies.messageBuilder
   * @param {object} dependencies.channelRouter
   */
  constructor(dependencies) {
    this.#assertPlainObject(dependencies, 'dependencies');

    this.#assertCallableMethod(
      dependencies.policy,
      'assertExecutionAllowed',
      'dependencies.policy'
    );
    this.#assertCallableMethod(
      dependencies.messageBuilder,
      'build',
      'dependencies.messageBuilder'
    );
    this.#assertCallableMethod(
      dependencies.channelRouter,
      'route',
      'dependencies.channelRouter'
    );

    this.policy = dependencies.policy;
    this.messageBuilder = dependencies.messageBuilder;
    this.channelRouter = dependencies.channelRouter;
  }

  /**
   * Executes one already-claimed recovery attempt.
   *
   * @param {object} context
   * @returns {Promise<Readonly<object>>}
   */
  async execute(context) {
    this.#assertPlainObject(context, 'context');
    this.#assertPlainObject(
      context.policyContext,
      'context.policyContext'
    );
    this.#assertPlainObject(
      context.messageContext,
      'context.messageContext'
    );
    this.#assertPlainObject(
      context.providers,
      'context.providers'
    );

    const policyContext = context.policyContext;
    const messageContext = context.messageContext;
    const providers = context.providers;

    this.policy.assertExecutionAllowed(policyContext);

    const attemptId = this.#resolveEntityIdentifier(
      policyContext.attempt,
      'policyContext.attempt'
    );
    const opportunityId = this.#resolveEntityIdentifier(
      policyContext.opportunity,
      'policyContext.opportunity'
    );

    const payload = this.messageBuilder.build(messageContext);
    const channel = this.#resolvePayloadChannel(payload);
    const executionPayload =
      channel === RECOVERY_CHANNEL.WHATSAPP
        ? Object.freeze({
            ...payload,
            recipient: policyContext.patient.phoneNumber,
          })
        : payload;
    const route = this.channelRouter.route({
      payload: executionPayload,
      providers,
    });

    const provider = this.#validateRoute(route, executionPayload);

    let providerResponse;

    try {
      providerResponse = await provider.send(executionPayload);
    } catch (cause) {
      throw new RecoveryExecutionError(
        'Recovery provider send failed.',
        {
          reason: 'PROVIDER_SEND_FAILED',
          operation: 'send',
          attemptId,
          opportunityId,
          channel,
        },
        { cause }
      );
    }

    return Object.freeze({
      attemptId,
      opportunityId,
      channel,
      providerResponse,
    });
  }

  #validateRoute(route, payload) {
    if (
      route === null ||
      typeof route !== 'object' ||
      Array.isArray(route)
    ) {
      throw new TypeError(
        'RecoveryExecutionService: channelRouter.route() must return an object.'
      );
    }

    const providerDescriptor = Object.getOwnPropertyDescriptor(
      route,
      'provider'
    );
    const payloadDescriptor = Object.getOwnPropertyDescriptor(
      route,
      'payload'
    );

    if (
      !providerDescriptor ||
      !Object.prototype.hasOwnProperty.call(providerDescriptor, 'value')
    ) {
      throw new TypeError(
        'RecoveryExecutionService: route.provider must be an own data property.'
      );
    }

    if (
      !payloadDescriptor ||
      !Object.prototype.hasOwnProperty.call(payloadDescriptor, 'value')
    ) {
      throw new TypeError(
        'RecoveryExecutionService: route.payload must be an own data property.'
      );
    }

    if (payloadDescriptor.value !== payload) {
      throw new TypeError(
        'RecoveryExecutionService: routed payload must preserve the built payload reference.'
      );
    }

    const provider = providerDescriptor.value;

    if (
      provider === null ||
      (typeof provider !== 'object' && typeof provider !== 'function')
    ) {
      throw new TypeError(
        'RecoveryExecutionService: route.provider must be an object or function.'
      );
    }

    if (typeof provider.send !== 'function') {
      throw new TypeError(
        'RecoveryExecutionService: route.provider.send must be callable.'
      );
    }

    return provider;
  }

  #resolvePayloadChannel(payload) {
    if (
      payload === null ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      throw new TypeError(
        'RecoveryExecutionService: messageBuilder.build() must return an object.'
      );
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      payload,
      'channel'
    );

    if (
      !descriptor ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new TypeError(
        'RecoveryExecutionService: payload.channel must be an own data property.'
      );
    }

    if (
      typeof descriptor.value !== 'string' ||
      descriptor.value.trim().length === 0
    ) {
      throw new TypeError(
        'RecoveryExecutionService: payload.channel must be a non-empty string.'
      );
    }

    return descriptor.value;
  }

  #resolveEntityIdentifier(entity, fieldName) {
    if (
      entity === null ||
      typeof entity !== 'object' ||
      Array.isArray(entity)
    ) {
      throw new TypeError(
        `RecoveryExecutionService: "${fieldName}" must be an object.`
      );
    }

    const identifier = entity.id;

    if (!this.#isIdentifier(identifier)) {
      throw new TypeError(
        `RecoveryExecutionService: "${fieldName}.id" must be a non-empty string or finite number.`
      );
    }

    return identifier;
  }

  #isIdentifier(value) {
    return (
      (typeof value === 'string' && value.trim().length > 0) ||
      (typeof value === 'number' && Number.isFinite(value))
    );
  }

  #assertCallableMethod(value, methodName, fieldName) {
    if (
      value === null ||
      (typeof value !== 'object' && typeof value !== 'function') ||
      typeof value[methodName] !== 'function'
    ) {
      throw new TypeError(
        `RecoveryExecutionService: "${fieldName}.${methodName}" must be callable.`
      );
    }
  }

  #assertPlainObject(value, fieldName) {
    if (!this.#isPlainObject(value)) {
      throw new TypeError(
        `RecoveryExecutionService: "${fieldName}" must be a plain object.`
      );
    }
  }

  #isPlainObject(value) {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
  }
}

module.exports = RecoveryExecutionService;
