'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  TEMPLATE_PLACEHOLDER_VALUES,
} = require('../../src/contracts/communication');

const {
  MessageContextBuilder,
  DEFAULT_TIMEZONE,
  DEFAULT_LOCALE,
  MESSAGE_CONTEXT_KEYS,
} = require('../../src/core/communication');

describe('MessageContextBuilder', () => {
  test('builds the approved communication context', () => {
    const builder = new MessageContextBuilder();

    const result = builder.build({
      patient: {
        full_name: 'منة',
      },

      clinic: {
        name: 'عيادات أوريان',
        phone: '+966500000000',
        timezone: 'Asia/Riyadh',
        google_review_url:
          'https://example.com/review',
      },

      branch: {
        name: 'فرع الصالحية',
        address: 'جدة، حي الصالحية',
        timezone: 'Asia/Riyadh',
      },

      doctor: {
        title: 'د.',
        full_name: 'آلاء أيمن',
      },

      service: {
        name: 'فيلر',
      },

      room: {
        room_name: 'غرفة حقن',
      },

      appointment: {
        appointment_start:
          '2026-08-01T08:00:00.000Z',
        booking_reference: 'GB-1001',
        payment_method_name: 'Cash',
      },
    });

    assert.deepEqual(result.context, {
      patient_name: 'منة',
      clinic_name: 'عيادات أوريان',
      branch_name: 'فرع الصالحية',
      doctor_name: 'د. آلاء أيمن',
      service_name: 'فيلر',
      room_name: 'غرفة حقن',
      appointment_date: '01/08/2026',
      appointment_time: '11:00 am',
      payment_method: 'Cash',
      clinic_phone: '+966500000000',
      clinic_address: 'جدة، حي الصالحية',
      google_review_url:
        'https://example.com/review',
      booking_reference: 'GB-1001',
    });

    assert.equal(
      result.timezone,
      'Asia/Riyadh'
    );

    assert.equal(result.locale, 'en-GB');
  });

  test('supports camelCase source properties', () => {
    const builder = new MessageContextBuilder();

    const result = builder.build({
      patient: {
        fullName: 'سارة',
      },

      clinic: {
        name: 'عيادات أوريان',
        whatsappNumber: '+966511111111',
      },

      doctor: {
        fullName: 'نوف الراجحي',
      },

      room: {
        roomName: 'غرفة ليزر 2',
      },

      appointment: {
        appointmentStart:
          '2026-08-02T08:00:00.000Z',
        bookingReference: 'GB-1002',
      },

      googleReviewUrl:
        'https://example.com/google',
    });

    assert.equal(
      result.context.patient_name,
      'سارة'
    );

    assert.equal(
      result.context.doctor_name,
      'نوف الراجحي'
    );

    assert.equal(
      result.context.room_name,
      'غرفة ليزر 2'
    );

    assert.equal(
      result.context.clinic_phone,
      '+966511111111'
    );

    assert.equal(
      result.context.booking_reference,
      'GB-1002'
    );

    assert.equal(
      result.context.google_review_url,
      'https://example.com/google'
    );
  });

  test('uses branch timezone before clinic timezone', () => {
    const builder = new MessageContextBuilder();

    const result = builder.build({
      clinic: {
        timezone: 'UTC',
      },

      branch: {
        timezone: 'Asia/Riyadh',
      },

      appointment: {
        appointment_start:
          '2026-08-01T21:30:00.000Z',
      },
    });

    assert.equal(
      result.timezone,
      'Asia/Riyadh'
    );

    assert.equal(
      result.context.appointment_date,
      '02/08/2026'
    );

    assert.equal(
      result.context.appointment_time,
      '12:30 am'
    );
  });

  test('allows an explicit timezone override', () => {
    const builder = new MessageContextBuilder();

    const result = builder.build(
      {
        branch: {
          timezone: 'Asia/Riyadh',
        },

        appointment: {
          appointment_start:
            '2026-08-01T08:00:00.000Z',
        },
      },
      {
        timezone: 'UTC',
      }
    );

    assert.equal(result.timezone, 'UTC');

    assert.equal(
      result.context.appointment_time,
      '08:00 am'
    );
  });

  test('uses the approved default timezone and locale', () => {
    const builder = new MessageContextBuilder();

    const result = builder.build({});

    assert.equal(
      result.timezone,
      DEFAULT_TIMEZONE
    );

    assert.equal(
      result.locale,
      DEFAULT_LOCALE
    );
  });

  test('uses payment-method relation data before appointment fallback', () => {
    const builder = new MessageContextBuilder();

    const result = builder.build({
      paymentMethod: {
        name: 'Insurance',
      },

      appointment: {
        payment_method_name: 'Cash',
      },
    });

    assert.equal(
      result.context.payment_method,
      'Insurance'
    );
  });

  test('combines doctor title and full name', () => {
    const builder = new MessageContextBuilder();

    const result = builder.build({
      doctor: {
        title: 'د.',
        full_name: 'سارة الشمري',
      },
    });

    assert.equal(
      result.context.doctor_name,
      'د. سارة الشمري'
    );
  });

  test('does not duplicate a doctor title already present in the name', () => {
    const builder = new MessageContextBuilder();

    const result = builder.build({
      doctor: {
        title: 'د.',
        full_name: 'د. سارة الشمري',
      },
    });

    assert.equal(
      result.context.doctor_name,
      'د. سارة الشمري'
    );
  });

  test('normalizes surrounding and repeated whitespace', () => {
    const builder = new MessageContextBuilder();

    const result = builder.build({
      patient: {
        full_name: '  منة   محمد  ',
      },

      doctor: {
        title: ' د. ',
        full_name: '  آلاء   أيمن ',
      },
    });

    assert.equal(
      result.context.patient_name,
      'منة محمد'
    );

    assert.equal(
      result.context.doctor_name,
      'د. آلاء أيمن'
    );
  });

  test('returns null for unavailable optional values', () => {
    const builder = new MessageContextBuilder();

    const result = builder.build({});

    for (
      const key of TEMPLATE_PLACEHOLDER_VALUES
    ) {
      assert.equal(result.context[key], null);
    }
  });

  test('exposes exactly the approved placeholder keys', () => {
    assert.deepEqual(
      MESSAGE_CONTEXT_KEYS,
      TEMPLATE_PLACEHOLDER_VALUES
    );

    const builder = new MessageContextBuilder();
    const result = builder.build({});

    assert.deepEqual(
      Object.keys(result.context),
      TEMPLATE_PLACEHOLDER_VALUES
    );
  });

  test('returns immutable build results', () => {
    const builder = new MessageContextBuilder();

    const result = builder.build({
      patient: {
        full_name: 'منة',
      },
    });

    assert.equal(Object.isFrozen(result), true);

    assert.equal(
      Object.isFrozen(result.context),
      true
    );
  });

  test('does not mutate the supplied source data', () => {
    const builder = new MessageContextBuilder();

    const source = {
      patient: {
        full_name: '  منة  ',
      },
    };

    const snapshot = JSON.parse(
      JSON.stringify(source)
    );

    builder.build(source);

    assert.deepEqual(source, snapshot);
  });

  test('rejects invalid appointment dates', () => {
    const builder = new MessageContextBuilder();

    assert.throws(
      () =>
        builder.build({
          appointment: {
            appointment_start:
              'invalid-date',
          },
        }),
      {
        name: 'TypeError',
        message:
          'Appointment start must be a valid date.',
      }
    );
  });

  test('rejects invalid source values', () => {
    const builder = new MessageContextBuilder();

    const invalidSources = [
      null,
      undefined,
      [],
      'source',
      123,
      true,
    ];

    for (const source of invalidSources) {
      assert.throws(
        () => builder.build(source),
        {
          name: 'TypeError',
          message:
            'Message context source must be an object.',
        }
      );
    }
  });

  test('rejects invalid locale values', () => {
    const builder = new MessageContextBuilder();

    const invalidLocales = [
      '',
      '   ',
      null,
      123,
      'not_a_locale',
    ];

    for (const locale of invalidLocales) {
      assert.throws(
        () =>
          builder.build(
            {},
            {
              locale,
            }
          ),
        {
          name: 'TypeError',
        }
      );
    }
  });

  test('rejects invalid timezone values', () => {
    const builder = new MessageContextBuilder();

    const invalidTimezones = [
      '',
      '   ',
      null,
      123,
      'Invalid/Timezone',
    ];

    for (const timezone of invalidTimezones) {
      assert.throws(
        () =>
          builder.build(
            {},
            {
              timezone,
            }
          ),
        {
          name: 'TypeError',
        }
      );
    }
  });
});