'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  COMMUNICATION_EVENT,
  COMMUNICATION_CHANNEL,
  TEMPLATE_CODE,
} = require('../../src/contracts/communication');

const {
  MessageTemplateResolver,
} = require('../../src/core/communication');

describe('MessageTemplateResolver', () => {
  test('resolves a communication event to its stable template code', () => {
    const resolver =
      new MessageTemplateResolver();

    const result = resolver.resolve(
      COMMUNICATION_EVENT.BOOKING_CONFIRMED
    );

    assert.deepEqual(result, {
      eventName:
        COMMUNICATION_EVENT.BOOKING_CONFIRMED,

      templateCode:
        TEMPLATE_CODE.BOOKING_CONFIRMED,

      language: 'ar',

      channel:
        COMMUNICATION_CHANNEL.WHATSAPP,
    });
  });

  test('resolves every approved communication event', () => {
    const resolver =
      new MessageTemplateResolver();

    for (
      const eventName of
      Object.values(COMMUNICATION_EVENT)
    ) {
      const result = resolver.resolve(eventName);

      assert.equal(result.eventName, eventName);

      assert.equal(
        typeof result.templateCode,
        'string'
      );

      assert.notEqual(
        result.templateCode.trim(),
        ''
      );
    }
  });

  test('supports custom language and channel options', () => {
    const resolver =
      new MessageTemplateResolver();

    const result = resolver.resolve(
      COMMUNICATION_EVENT.REMINDER_24H,
      {
        language: 'en',
        channel: 'email',
      }
    );

    assert.equal(result.language, 'en');
    assert.equal(result.channel, 'email');
  });

  test('uses default values when options are omitted or undefined', () => {
    const resolver =
      new MessageTemplateResolver();

    const omittedResult = resolver.resolve(
      COMMUNICATION_EVENT.BOOKING_CONFIRMED
    );

    const undefinedResult = resolver.resolve(
      COMMUNICATION_EVENT.BOOKING_CONFIRMED,
      {
        language: undefined,
        channel: undefined,
      }
    );

    assert.equal(omittedResult.language, 'ar');

    assert.equal(
      omittedResult.channel,
      COMMUNICATION_CHANNEL.WHATSAPP
    );

    assert.equal(undefinedResult.language, 'ar');

    assert.equal(
      undefinedResult.channel,
      COMMUNICATION_CHANNEL.WHATSAPP
    );
  });

  test('reports whether an event is supported', () => {
    const resolver =
      new MessageTemplateResolver();

    assert.equal(
      resolver.supports(
        COMMUNICATION_EVENT.VISIT_COMPLETED
      ),
      true
    );

    assert.equal(
      resolver.supports('UNKNOWN_EVENT'),
      false
    );
  });

  test('rejects unknown communication events', () => {
    const resolver =
      new MessageTemplateResolver();

    assert.throws(
      () => resolver.resolve('UNKNOWN_EVENT'),
      {
        name: 'TypeError',
        message:
          'Communication event is invalid or unsupported.',
      }
    );
  });

  test('rejects invalid language values', () => {
    const resolver =
      new MessageTemplateResolver();

    const invalidLanguages = [
      '',
      'arabic',
      'AR',
      'ar_sa',
      null,
      123,
    ];

    for (const language of invalidLanguages) {
      assert.throws(
        () =>
          resolver.resolve(
            COMMUNICATION_EVENT.BOOKING_CONFIRMED,
            {
              language,
            }
          ),
        {
          name: 'TypeError',
          message:
            'Template language must use a valid language code.',
        }
      );
    }
  });

  test('rejects invalid channel values', () => {
    const resolver =
      new MessageTemplateResolver();

    const invalidChannels = [
      '',
      '   ',
      null,
      123,
    ];

    for (const channel of invalidChannels) {
      assert.throws(
        () =>
          resolver.resolve(
            COMMUNICATION_EVENT.BOOKING_CONFIRMED,
            {
              channel,
            }
          ),
        {
          name: 'TypeError',
          message:
            'Communication channel must be a non-empty string.',
        }
      );
    }
  });

  test('returns an immutable resolution object', () => {
    const resolver =
      new MessageTemplateResolver();

    const result = resolver.resolve(
      COMMUNICATION_EVENT.NO_SHOW
    );

    assert.equal(Object.isFrozen(result), true);
  });
});