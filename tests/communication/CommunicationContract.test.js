'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const contract = require(
  '../../src/contracts/communication'
);

describe('Communication Contract v1', () => {
  test('defines the approved appointment communication events', () => {
    assert.deepEqual(contract.COMMUNICATION_EVENT_VALUES, [
      'BOOKING_CONFIRMED',
      'REMINDER_24H',
      'REMINDER_2H',
      'VISIT_COMPLETED',
      'REVIEW_REQUEST',
      'APPOINTMENT_CANCELLED',
      'NO_SHOW',
    ]);
  });

  test('maps every approved event to one stable template code', () => {
    for (const eventName of contract.COMMUNICATION_EVENT_VALUES) {
      const templateCode =
        contract.getTemplateCodeForEvent(eventName);

      assert.equal(
        contract.isTemplateCode(templateCode),
        true
      );
    }

    assert.equal(
      contract.getTemplateCodeForEvent('UNKNOWN_EVENT'),
      null
    );
  });

  test('defines the approved delivery lifecycle', () => {
    assert.deepEqual(contract.DELIVERY_STATUS_VALUES, [
      'pending',
      'processing',
      'sent',
      'delivered',
      'read',
      'failed',
      'cancelled',
    ]);
  });

  test('exposes the approved placeholder registry', () => {
    assert.equal(
      contract.isTemplatePlaceholder('patient_name'),
      true
    );

    assert.equal(
      contract.isTemplatePlaceholder('booking_reference'),
      true
    );

    assert.equal(
      contract.isTemplatePlaceholder(
        'unapproved_placeholder'
      ),
      false
    );
  });

  test('freezes public contract collections', () => {
    assert.equal(
      Object.isFrozen(contract.COMMUNICATION_EVENT),
      true
    );

    assert.equal(
      Object.isFrozen(contract.TEMPLATE_CODE),
      true
    );

    assert.equal(
      Object.isFrozen(contract.EVENT_TEMPLATE_CODE),
      true
    );

    assert.equal(
      Object.isFrozen(contract.DELIVERY_STATUS),
      true
    );

    assert.equal(
      Object.isFrozen(contract.TEMPLATE_PLACEHOLDER),
      true
    );

    assert.equal(
      Object.isFrozen(contract.RETRY_POLICY),
      true
    );

    assert.equal(
      Object.isFrozen(
        contract.RETRY_POLICY.BACKOFF_MINUTES
      ),
      true
    );
  });

  test('uses the approved retry policy', () => {
    assert.equal(
      contract.RETRY_POLICY.MAX_ATTEMPTS,
      3
    );

    assert.deepEqual(
      contract.RETRY_POLICY.BACKOFF_MINUTES,
      [1, 5, 15]
    );
  });
});