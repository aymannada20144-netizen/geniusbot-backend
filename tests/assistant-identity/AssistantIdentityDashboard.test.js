'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const page = fs.readFileSync(path.join(root, 'geniusbot-dashboard/src/pages/dashboard/SettingsPage.tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'geniusbot-dashboard/src/api/assistantIdentityApi.ts'), 'utf8');

test('settings exposes identity fields, derived preview, and Meta clarification', () => {
  assert.match(page, /Assistant Identity/);
  assert.match(page, /Assistant name/);
  assert.match(page, /assistantGender === 'male' \? 'موظف الاستقبال الذكي' : 'موظفة الاستقبال الذكية'/);
  assert.match(page, /does not change the WhatsApp Business display name managed by Meta/);
});

test('settings uses official permissions and blocks duplicate submission', () => {
  assert.match(page, /ai_settings:view/);
  assert.match(page, /ai_settings:update/);
  assert.match(page, /!saveIdentity\.isPending/);
  assert.match(page, /disabled=\{!canUpdateIdentity \|\| saveIdentity\.isPending\}/);
});

test('API sends only the approved identity contract to PUT endpoint', () => {
  assert.match(api, /assistantName: string/);
  assert.match(api, /assistantGender: AssistantGender/);
  assert.match(api, /expectedUpdatedAt: string \| null/);
  assert.match(api, /apiClient\.put/);
});
