'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const AppointmentEvents = require(
  '../../src/modules/appointments/AppointmentEvents'
);

test('defines the immutable appointment status-changed event name', () => {
  assert.equal(
    AppointmentEvents.STATUS_CHANGED,
    'appointment.status_changed'
  );
  assert.equal(Object.isFrozen(AppointmentEvents), true);
  assert.equal(AppointmentEvents.CHANGED, 'appointment.changed');
  assert.throws(() => {
    AppointmentEvents.STATUS_CHANGED = 'changed';
  }, TypeError);
});
