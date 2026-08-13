'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const page = fs.readFileSync(path.join(
  root, 'geniusbot-dashboard/src/pages/dashboard/AppointmentsPage.tsx'
), 'utf8');
const api = fs.readFileSync(path.join(
  root, 'geniusbot-dashboard/src/api/appointmentsApi.ts'
), 'utf8');

describe('Dashboard appointment reschedule UI', () => {
  test('shows reschedule only for pending and confirmed appointments', () => {
    assert.match(page, /const canReschedule = appointment\.status === 'pending' \|\|\s+appointment\.status === 'confirmed'/);
    assert.match(page, /\{canReschedule && <Button[\s\S]*?تغيير الموعد<\/Button>\}/);
  });

  test('uses an explicit modal review and confirmation', () => {
    assert.match(page, /appointment-reschedule-dialog-title/);
    assert.match(page, /التاريخ الحالي/);
    assert.match(page, /الوقت الحالي/);
    assert.match(page, /تأكيد تغيير الموعد/);
    assert.match(page, /الموعد الحالي:/);
    assert.match(page, /الموعد الجديد:/);
    assert.match(page, /formatArabicDate\(newDate\)/);
    assert.match(page, /formatArabicTime\(newTime\)/);
    assert.match(page, /setRescheduleTarget\(null\)/);
  });

  test('keeps raw values for API controls and formats only staff labels', () => {
    assert.match(page, /<option key=\{date\} value=\{date\}>\{formatArabicDate\(date\)\}/);
    assert.match(page, /<option key=\{time\} value=\{time\}>\{formatArabicTime\(time\)\}/);
    assert.match(page, /'أغسطس'/);
    assert.match(page, /hours < 12 \? 'ص' : 'م'/);
  });

  test('submission loading is independent from availability loading', () => {
    assert.match(page, /const \[availabilityLoading, setAvailabilityLoading\]/);
    assert.match(page, /const \[rescheduleSubmitting, setRescheduleSubmitting\]/);
    assert.match(page, /isLoading=\{rescheduleSubmitting\}/);
    assert.doesNotMatch(page, /isLoading=\{availabilityLoading\}/);
  });

  test('loads available dates and times and keeps conflict errors in the modal', () => {
    assert.match(page, /getRescheduleAvailableDates/);
    assert.match(page, /getRescheduleAvailableTimes/);
    assert.match(page, /الوقت المختار لم يعد متاحًا/);
    assert.match(page, /setRescheduleError/);
  });

  test('submits through the existing reschedule endpoint and refreshes the list', () => {
    assert.match(api, /api\/clinics.*appointments.*reschedule/);
    assert.match(api, /apiClient\.put/);
    assert.match(page, /setAppointments\(await getAppointments\(user!\.clinicId\)\)/);
  });

  test('retains existing check-in and cancellation actions', () => {
    assert.match(page, /changeStatus\(appointment\.id, 'checked_in'\)/);
    assert.match(page, /openCancellationDialog\(appointment\)/);
  });
});
