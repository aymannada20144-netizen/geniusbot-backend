'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  TemplateRenderer,
  OPTIONAL_PLACEHOLDER_POLICY,
  VALIDATION_ERROR_CODE,
  VALIDATION_WARNING_CODE,
} = require('../../src/core/template');

describe('TemplateRenderer', () => {
  test('renders a valid template with context values', () => {
    const renderer = new TemplateRenderer();

    const result = renderer.render(
      [
        'مرحباً {{patient_name}}',
        'موعدك مع {{doctor_name}}',
        'بتاريخ {{appointment_date}}',
      ].join('\n'),
      {
        patient_name: 'منة',
        doctor_name: 'د. آلاء أيمن',
        appointment_date: '01/08/2026',
      },
      {
        requiredPlaceholders: [
          'patient_name',
          'doctor_name',
          'appointment_date',
        ],
      }
    );

    assert.equal(result.isValid, true);
    assert.equal(result.rendered, true);

    assert.equal(
      result.body,
      [
        'مرحباً منة',
        'موعدك مع د. آلاء أيمن',
        'بتاريخ 01/08/2026',
      ].join('\n')
    );

    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });

  test('renders every repeated placeholder occurrence', () => {
    const renderer = new TemplateRenderer();

    const result = renderer.render(
      '{{patient_name}} - {{patient_name}}',
      {
        patient_name: 'منة',
      },
      {
        requiredPlaceholders: [
          'patient_name',
        ],
      }
    );

    assert.equal(result.body, 'منة - منة');

    assert.deepEqual(
      result.duplicatePlaceholders,
      ['patient_name']
    );
  });

  test('supports spaces around placeholder names', () => {
    const renderer = new TemplateRenderer();

    const result = renderer.render(
      'مرحباً {{ patient_name }}',
      {
        patient_name: 'منة',
      }
    );

    assert.equal(result.body, 'مرحباً منة');
  });

  test('converts numbers and booleans to strings', () => {
    const renderer = new TemplateRenderer();

    const numberResult = renderer.render(
      '{{booking_reference}}',
      {
        booking_reference: 0,
      }
    );

    const booleanResult = renderer.render(
      '{{booking_reference}}',
      {
        booking_reference: false,
      }
    );

    assert.equal(numberResult.body, '0');
    assert.equal(booleanResult.body, 'false');
  });

  test('replaces missing optional placeholders with empty strings by default', () => {
    const renderer = new TemplateRenderer();

    const result = renderer.render(
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
    assert.equal(result.rendered, true);

    assert.equal(
      result.body,
      [
        'مرحباً منة',
        'العنوان: ',
      ].join('\n')
    );

    assert.deepEqual(
      result.missingOptionalPlaceholders,
      ['clinic_address']
    );

    assert.equal(
      result.warnings[0].code,
      VALIDATION_WARNING_CODE.MISSING_OPTIONAL_PLACEHOLDER
    );
  });

  test('can preserve missing optional tokens', () => {
    const renderer = new TemplateRenderer();

    const result = renderer.render(
      'العنوان: {{clinic_address}}',
      {},
      {
        optionalPlaceholderPolicy:
          OPTIONAL_PLACEHOLDER_POLICY.KEEP_TOKEN,
      }
    );

    assert.equal(
      result.body,
      'العنوان: {{clinic_address}}'
    );

    assert.equal(
      result.optionalPlaceholderPolicy,
      OPTIONAL_PLACEHOLDER_POLICY.KEEP_TOKEN
    );
  });

  test('does not render templates with unknown placeholders', () => {
    const renderer = new TemplateRenderer();

    const result = renderer.render(
      'العمر: {{patient_age}}',
      {
        patient_age: 25,
      }
    );

    assert.equal(result.isValid, false);
    assert.equal(result.rendered, false);
    assert.equal(result.body, null);

    assert.equal(
      result.errors[0].code,
      VALIDATION_ERROR_CODE.UNKNOWN_PLACEHOLDER
    );
  });

  test('does not render when required context is missing', () => {
    const renderer = new TemplateRenderer();

    const result = renderer.render(
      'مرحباً {{patient_name}}',
      {},
      {
        requiredPlaceholders: [
          'patient_name',
        ],
      }
    );

    assert.equal(result.isValid, false);
    assert.equal(result.rendered, false);
    assert.equal(result.body, null);

    assert.deepEqual(
      result.missingRequiredPlaceholders,
      ['patient_name']
    );
  });

  test('reports unused context values', () => {
    const renderer = new TemplateRenderer();

    const result = renderer.render(
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
    const renderer = new TemplateRenderer();

    const result = renderer.render(
      'مرحباً {{patient_name}}',
      {
        patient_name: 'منة',
        clinic_name: 'عيادات أوريان',
      },
      {
        reportUnusedContext: false,
      }
    );

    assert.deepEqual(result.unusedContextKeys, []);
    assert.deepEqual(result.warnings, []);
  });

  test('leaves unsupported placeholder syntax unchanged', () => {
    const renderer = new TemplateRenderer();

    const result = renderer.render(
      [
        '{{PatientName}}',
        '{{patient-name}}',
        '{patient_name}',
      ].join(' '),
      {
        patient_name: 'منة',
      },
      {
        reportUnusedContext: false,
      }
    );

    assert.equal(
      result.body,
      [
        '{{PatientName}}',
        '{{patient-name}}',
        '{patient_name}',
      ].join(' ')
    );
  });

  test('renders templates without placeholders unchanged', () => {
    const renderer = new TemplateRenderer();

    const result = renderer.render(
      'مرحباً بك في العيادة.',
      {}
    );

    assert.equal(result.isValid, true);
    assert.equal(result.rendered, true);

    assert.equal(
      result.body,
      'مرحباً بك في العيادة.'
    );
  });

  test('returns immutable rendering results', () => {
    const renderer = new TemplateRenderer();

    const result = renderer.render(
      '{{patient_name}}',
      {
        patient_name: 'منة',
      }
    );

    assert.equal(Object.isFrozen(result), true);

    assert.equal(
      Object.isFrozen(result.placeholdersUsed),
      true
    );

    assert.equal(
      Object.isFrozen(
        result.missingRequiredPlaceholders
      ),
      true
    );

    assert.equal(
      Object.isFrozen(
        result.missingOptionalPlaceholders
      ),
      true
    );

    assert.equal(
      Object.isFrozen(result.errors),
      true
    );

    assert.equal(
      Object.isFrozen(result.warnings),
      true
    );
  });

  test('rejects invalid optional-placeholder policies', () => {
    const renderer = new TemplateRenderer();

    assert.throws(
      () =>
        renderer.render(
          '{{patient_name}}',
          {
            patient_name: 'منة',
          },
          {
            optionalPlaceholderPolicy:
              'invalid_policy',
          }
        ),
      {
        name: 'TypeError',
        message:
          'Optional placeholder policy is invalid.',
      }
    );
  });

  test('rejects invalid validator dependencies', () => {
    assert.throws(
      () =>
        new TemplateRenderer({
          validator: {},
        }),
      {
        name: 'TypeError',
        message:
          'Template validator must expose a validate function.',
      }
    );
  });
});