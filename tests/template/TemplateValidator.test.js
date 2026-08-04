'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  TemplateValidator,
  VALIDATION_ERROR_CODE,
  VALIDATION_WARNING_CODE,
} = require('../../src/core/template');

describe('TemplateValidator', () => {
  test('accepts a valid template with complete context', () => {
    const validator = new TemplateValidator();

    const result = validator.validate(
      [
        'مرحباً {{patient_name}}',
        'موعدك بتاريخ {{appointment_date}}',
      ].join('\n'),
      {
        patient_name: 'منة',
        appointment_date: '01/08/2026',
      },
      {
        requiredPlaceholders: [
          'patient_name',
          'appointment_date',
        ],
      }
    );

    assert.equal(result.isValid, true);

    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);

    assert.deepEqual(
      result.missingRequiredPlaceholders,
      []
    );

    assert.deepEqual(
      result.missingOptionalPlaceholders,
      []
    );
  });

  test('rejects an unknown placeholder', () => {
    const validator = new TemplateValidator();

    const result = validator.validate(
      'مرحباً {{patient_age}}',
      {
        patient_age: 25,
      }
    );

    assert.equal(result.isValid, false);

    assert.deepEqual(result.unknownPlaceholders, [
      'patient_age',
    ]);

    assert.equal(
      result.errors[0].code,
      VALIDATION_ERROR_CODE.UNKNOWN_PLACEHOLDER
    );
  });

  test('rejects a missing required placeholder value', () => {
    const validator = new TemplateValidator();

    const result = validator.validate(
      'مرحباً {{patient_name}}',
      {},
      {
        requiredPlaceholders: [
          'patient_name',
        ],
      }
    );

    assert.equal(result.isValid, false);

    assert.deepEqual(
      result.missingRequiredPlaceholders,
      ['patient_name']
    );

    assert.equal(
      result.errors[0].code,
      VALIDATION_ERROR_CODE.MISSING_REQUIRED_PLACEHOLDER
    );
  });

  test('treats null undefined and blank strings as missing', () => {
    const validator = new TemplateValidator();

    const missingValues = [
      null,
      undefined,
      '',
      '   ',
    ];

    for (const value of missingValues) {
      const result = validator.validate(
        '{{patient_name}}',
        {
          patient_name: value,
        },
        {
          requiredPlaceholders: [
            'patient_name',
          ],
        }
      );

      assert.equal(result.isValid, false);

      assert.deepEqual(
        result.missingRequiredPlaceholders,
        ['patient_name']
      );
    }
  });

  test('accepts zero and false as usable context values', () => {
    const validator = new TemplateValidator();

    const zeroResult = validator.validate(
      '{{booking_reference}}',
      {
        booking_reference: 0,
      },
      {
        requiredPlaceholders: [
          'booking_reference',
        ],
      }
    );

    const falseResult = validator.validate(
      '{{booking_reference}}',
      {
        booking_reference: false,
      },
      {
        requiredPlaceholders: [
          'booking_reference',
        ],
      }
    );

    assert.equal(zeroResult.isValid, true);
    assert.equal(falseResult.isValid, true);
  });

  test('warns when an optional placeholder is missing', () => {
    const validator = new TemplateValidator();

    const result = validator.validate(
      [
        'مرحباً {{patient_name}}',
        'العنوان: {{clinic_address}}',
      ].join('\n'),
      {
        patient_name: 'منة',
      },
      {
        requiredPlaceholders: [
          'patient_name',
        ],
      }
    );

    assert.equal(result.isValid, true);

    assert.deepEqual(
      result.missingOptionalPlaceholders,
      ['clinic_address']
    );

    assert.equal(
      result.warnings[0].code,
      VALIDATION_WARNING_CODE.MISSING_OPTIONAL_PLACEHOLDER
    );
  });

  test('warns about unused context values', () => {
    const validator = new TemplateValidator();

    const result = validator.validate(
      'مرحباً {{patient_name}}',
      {
        patient_name: 'منة',
        clinic_name: 'عيادات أوريان',
      }
    );

    assert.equal(result.isValid, true);

    assert.deepEqual(result.unusedContextKeys, [
      'clinic_name',
    ]);

    assert.equal(
      result.warnings[0].code,
      VALIDATION_WARNING_CODE.UNUSED_CONTEXT_VALUE
    );
  });

  test('can disable unused-context warnings', () => {
    const validator = new TemplateValidator();

    const result = validator.validate(
      'مرحباً {{patient_name}}',
      {
        patient_name: 'منة',
        clinic_name: 'عيادات أوريان',
      },
      {
        reportUnusedContext: false,
      }
    );

    assert.equal(result.isValid, true);

    assert.deepEqual(result.unusedContextKeys, []);
    assert.deepEqual(result.warnings, []);
  });

  test('reports duplicate placeholders without rejecting them', () => {
    const validator = new TemplateValidator();

    const result = validator.validate(
      [
        '{{patient_name}}',
        '{{patient_name}}',
        '{{appointment_date}}',
      ].join(' '),
      {
        patient_name: 'منة',
        appointment_date: '01/08/2026',
      }
    );

    assert.equal(result.isValid, true);

    assert.deepEqual(
      result.duplicatePlaceholders,
      ['patient_name']
    );
  });

  test('rejects unapproved required placeholders', () => {
    const validator = new TemplateValidator();

    const result = validator.validate(
      'رسالة ثابتة',
      {},
      {
        requiredPlaceholders: [
          'unapproved_value',
        ],
      }
    );

    assert.equal(result.isValid, false);

    assert.equal(
      result.errors[0].code,
      VALIDATION_ERROR_CODE.INVALID_REQUIRED_PLACEHOLDER
    );

    assert.equal(
      result.errors[0].placeholder,
      'unapproved_value'
    );
  });

  test('returns immutable validation results', () => {
    const validator = new TemplateValidator();

    const result = validator.validate(
      '{{patient_name}}',
      {
        patient_name: 'منة',
      }
    );

    assert.equal(Object.isFrozen(result), true);

    assert.equal(
      Object.isFrozen(result.errors),
      true
    );

    assert.equal(
      Object.isFrozen(result.warnings),
      true
    );

    assert.equal(
      Object.isFrozen(result.placeholders),
      true
    );

    assert.equal(
      Object.isFrozen(
        result.uniquePlaceholders
      ),
      true
    );
  });

  test('accepts a template without placeholders', () => {
    const validator = new TemplateValidator();

    const result = validator.validate(
      'مرحباً بك في العيادة.',
      {}
    );

    assert.equal(result.isValid, true);

    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.placeholders, []);
  });

  test('rejects an invalid context value', () => {
    const validator = new TemplateValidator();

    const invalidContexts = [
      null,
      [],
      'context',
      123,
      true,
    ];

    for (const context of invalidContexts) {
      assert.throws(
        () =>
          validator.validate(
            '{{patient_name}}',
            context
          ),
        {
          name: 'TypeError',
          message:
            'Template context must be an object.',
        }
      );
    }
  });

  test('rejects invalid required-placeholder options', () => {
    const validator = new TemplateValidator();

    assert.throws(
      () =>
        validator.validate(
          '{{patient_name}}',
          {},
          {
            requiredPlaceholders:
              'patient_name',
          }
        ),
      {
        name: 'TypeError',
        message:
          'Required placeholders must be an array.',
      }
    );

    assert.throws(
      () =>
        validator.validate(
          '{{patient_name}}',
          {},
          {
            requiredPlaceholders: [''],
          }
        ),
      {
        name: 'TypeError',
        message:
          'Every required placeholder must be a non-empty string.',
      }
    );
  });

  test('rejects invalid constructor dependencies', () => {
    assert.throws(
      () =>
        new TemplateValidator({
          parser: {},
        }),
      {
        name: 'TypeError',
        message:
          'Template parser must expose a parse function.',
      }
    );

    assert.throws(
      () =>
        new TemplateValidator({
          approvedPlaceholders:
            'patient_name',
        }),
      {
        name: 'TypeError',
        message:
          'Approved placeholders must be an array.',
      }
    );
  });
});