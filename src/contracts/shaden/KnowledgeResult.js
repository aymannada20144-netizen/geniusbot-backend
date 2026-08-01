'use strict';

const ALLOWED_FIELDS = Object.freeze([
  'kind',
  'type',
  'status',
  'facts',
  'options',
  'references',
  'warnings',
]);

class KnowledgeResult {
  constructor(input) {
    const fields = readFields(input);

    if (fields.kind && fields.kind.value !== 'knowledge_result') {
      throw new TypeError(
        'KnowledgeResult requires kind to be knowledge_result'
      );
    }

    this.kind = 'knowledge_result';
    this.type = valueOrNull(fields.type);
    this.status = valueOrNull(fields.status);
    this.facts = copyArray(fields.facts, 'facts');
    this.options = copyArray(fields.options, 'options');
    this.references = copyArray(fields.references, 'references');
    this.warnings = copyArray(fields.warnings, 'warnings');

    Object.freeze(this);
  }

  static create(input) {
    return new KnowledgeResult(input);
  }
}

function readFields(input) {
  if (!isPlainObject(input)) {
    throw new TypeError('KnowledgeResult requires a plain object input');
  }

  const allowed = new Set(ALLOWED_FIELDS);
  const keys = Object.keys(input);
  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new TypeError(
        `KnowledgeResult received unsupported field: ${key}`
      );
    }
  }

  const fields = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor.get || descriptor.set) {
      throw new TypeError(
        `KnowledgeResult does not accept accessor property: ${key}`
      );
    }
    fields[key] = descriptor;
  }
  return fields;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function valueOrNull(descriptor) {
  return descriptor ? descriptor.value : null;
}

function copyArray(descriptor, fieldName) {
  if (!descriptor) return Object.freeze([]);
  if (!Array.isArray(descriptor.value)) {
    throw new TypeError(
      `KnowledgeResult requires ${fieldName} to be an Array`
    );
  }

  const source = descriptor.value;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(source, 'length');
  if (!lengthDescriptor || lengthDescriptor.get || lengthDescriptor.set) {
    throw new TypeError(
      `KnowledgeResult does not accept accessor property: ${fieldName}.length`
    );
  }

  const copy = new Array(lengthDescriptor.value);
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const item = Object.getOwnPropertyDescriptor(source, String(index));
    if (!item) continue;
    if (item.get || item.set) {
      throw new TypeError(
        `KnowledgeResult does not accept accessor property: ${fieldName}.${index}`
      );
    }
    Object.defineProperty(copy, String(index), {
      value: item.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return Object.freeze(copy);
}

module.exports = KnowledgeResult;
