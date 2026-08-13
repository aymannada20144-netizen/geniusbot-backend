'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.resolve(
  __dirname,
  '../../geniusbot-dashboard/src/pages/dashboard/AppointmentsPage.tsx',
), 'utf8');

test('refreshes the visible appointments after pending is confirmed', () => {
  const handler = page.match(/async function changeStatus\([\s\S]*?\n  }\n\n  function openCancellationDialog/)?.[0];

  assert.ok(handler, 'changeStatus handler must exist');
  assert.match(handler, /await updateAppointmentStatus\([\s\S]*?status,[\s\S]*?\)/);
  assert.match(handler, /setAppointments\(await getAppointments\(user!\.clinicId\)\)/);
  assert.ok(
    handler.indexOf('await updateAppointmentStatus(') <
      handler.indexOf('setAppointments(await getAppointments('),
    'the authoritative list refresh must occur after the status API succeeds',
  );
  assert.match(page, /changeStatus\(appointment\.id, 'confirmed'\)/);
  assert.match(page, /confirmed: 'Confirmed'/);
});
