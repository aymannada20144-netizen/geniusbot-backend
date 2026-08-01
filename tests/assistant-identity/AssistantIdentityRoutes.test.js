'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const registerRoutes = require('../../src/modules/assistant-identity/AssistantIdentityRoutes');

test('registers official view and update permissions', () => {
  const calls = [];
  const app = { get: (...args) => calls.push(['GET', ...args]), put: (...args) => calls.push(['PUT', ...args]) };
  const controller = { get() {}, update() {} };
  registerRoutes(app, controller, (permission) => [`protect:${permission}`]);
  assert.deepEqual(calls.map((call) => [call[0], call[2].preHandler]), [
    ['GET', ['protect:ai_settings:view']],
    ['PUT', ['protect:ai_settings:update']],
  ]);
});
