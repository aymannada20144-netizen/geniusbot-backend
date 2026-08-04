'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  TemplateParser,
} = require('../../src/core/template');

describe('TemplateParser', () => {
  test('extracts approved placeholders from a template', () => {
    const parser = new TemplateParser();

    const result = parser.parse(
      [
        'مرحباً {{patient_name}}',
        'موعدك مع {{doctor_name}}',
        'بتاريخ {{appointment_date}}',
      ].join('\n')
    );

    assert.deepEqual(result.placeholders, [
      'patient_name',
      'doctor_name',
      'appointment_date',
    ]);

    assert.deepEqual(result.uniquePlaceholders, [
      'patient_name',
      'doctor_name',
      'appointment_date',
    ]);

    assert.equal(result.count, 3);
    assert.equal(result.uniqueCount, 3);
    assert.equal(result.hasPlaceholders, true);
  });

  test('preserves repeated placeholder occurrences', () => {
    const parser = new TemplateParser();

    const result = parser.parse(
      [
        '{{patient_name}}',
        '{{patient_name}}',
        '{{patient_name}}',
      ].join('\n')
    );

    assert.deepEqual(result.placeholders, [
      'patient_name',
      'patient_name',
      'patient_name',
    ]);

    assert.deepEqual(result.uniquePlaceholders, [
      'patient_name',
    ]);

    assert.equal(result.count, 3);
    assert.equal(result.uniqueCount, 1);
  });

  test('allows spaces around a valid placeholder name', () => {
    const parser = new TemplateParser();

    const result = parser.parse(
      'مرحباً {{ patient_name }}'
    );

    assert.deepEqual(result.placeholders, [
      'patient_name',
    ]);
  });

  test('supports digits after the first letter', () => {
    const parser = new TemplateParser();

    const result = parser.parse(
      [
        '{{reminder_24h}}',
        '{{clinic2_phone}}',
        '{{value2}}',
      ].join(' ')
    );

    assert.deepEqual(result.placeholders, [
      'reminder_24h',
      'clinic2_phone',
      'value2',
    ]);
  });

  test('ignores empty placeholders', () => {
    const parser = new TemplateParser();

    const result = parser.parse(
      '{{}} {{   }}'
    );

    assert.deepEqual(result.placeholders, []);
    assert.equal(result.count, 0);
    assert.equal(result.hasPlaceholders, false);
  });

  test('ignores placeholders using unsupported syntax', () => {
    const parser = new TemplateParser();

    const result = parser.parse(
      [
        '{{PatientName}}',
        '{{patient-name}}',
        '{{patient.name}}',
        '{{patient Name}}',
        '{patient_name}',
        '[[patient_name]]',
      ].join(' ')
    );

    assert.deepEqual(result.placeholders, []);
    assert.equal(result.hasPlaceholders, false);
  });

  test('ignores names starting with a digit or underscore', () => {
    const parser = new TemplateParser();

    const result = parser.parse(
      '{{2patient}} {{_patient_name}}'
    );

    assert.deepEqual(result.placeholders, []);
  });

  test('extract returns all placeholder occurrences', () => {
    const parser = new TemplateParser();

    const placeholders = parser.extract(
      '{{patient_name}} {{patient_name}}'
    );

    assert.deepEqual(placeholders, [
      'patient_name',
      'patient_name',
    ]);
  });

  test('extractUnique returns unique placeholders only', () => {
    const parser = new TemplateParser();

    const placeholders = parser.extractUnique(
      [
        '{{patient_name}}',
        '{{doctor_name}}',
        '{{patient_name}}',
      ].join(' ')
    );

    assert.deepEqual(placeholders, [
      'patient_name',
      'doctor_name',
    ]);
  });

  test('hasPlaceholders reports whether valid placeholders exist', () => {
    const parser = new TemplateParser();

    assert.equal(
      parser.hasPlaceholders(
        'مرحباً {{patient_name}}'
      ),
      true
    );

    assert.equal(
      parser.hasPlaceholders('مرحباً بك'),
      false
    );
  });

  test('returns immutable result collections', () => {
    const parser = new TemplateParser();

    const result = parser.parse(
      '{{patient_name}}'
    );

    assert.equal(Object.isFrozen(result), true);

    assert.equal(
      Object.isFrozen(result.placeholders),
      true
    );

    assert.equal(
      Object.isFrozen(result.uniquePlaceholders),
      true
    );
  });

  test('accepts an empty template string', () => {
    const parser = new TemplateParser();

    const result = parser.parse('');

    assert.deepEqual(result.placeholders, []);
    assert.deepEqual(result.uniquePlaceholders, []);
    assert.equal(result.count, 0);
    assert.equal(result.uniqueCount, 0);
    assert.equal(result.hasPlaceholders, false);
  });

  test('rejects non-string template values', () => {
    const parser = new TemplateParser();

    const invalidValues = [
      null,
      undefined,
      123,
      {},
      [],
      true,
    ];

    for (const value of invalidValues) {
      assert.throws(
        () => parser.parse(value),
        {
          name: 'TypeError',
          message: 'Template must be a string.',
        }
      );
    }
  });
});