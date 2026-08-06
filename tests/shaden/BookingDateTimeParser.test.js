'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');
const {
  parsePreferredStart,
} = require('../../src/services/shaden/BookingDateTimeParser');

const policy = new ShadenPolicy();

function parse(text, {
  now = '2026-07-31T09:00:00.000Z',
  timeZone = 'Asia/Riyadh',
  previousValue = null,
} = {}) {
  return parsePreferredStart(text, previousValue, policy, {
    now: new Date(now),
    timeZone,
  });
}

function assertComplete(result, { date, time, value }) {
  assert.equal(result.complete, true);
  assert.deepEqual(result.date, date);
  assert.deepEqual(result.time, time);
  assert.equal(result.value, value);
}

describe('BookingDateTimeParser current behavior', () => {
  test('today at 6 PM uses the supplied Riyadh clock', () => {
    assertComplete(parse('اليوم الساعة 6 م'), {
      date: { year: 2026, month: 7, day: 31 },
      time: { hour: 18, minute: 0 },
      value: '2026-07-31T15:00:00.000Z',
    });
  });

  test('tomorrow at 6 PM advances one Riyadh calendar day', () => {
    assertComplete(parse('بكرة الساعة 6 م'), {
      date: { year: 2026, month: 8, day: 1 },
      time: { hour: 18, minute: 0 },
      value: '2026-08-01T15:00:00.000Z',
    });
  });

  test('غدا matches بكرة', () => {
    assert.deepEqual(parse('غدا الساعة 6 م'), parse('بكرة الساعة 6 م'));
  });

  test('tomorrow crosses a month boundary', () => {
    assertComplete(parse('بكرة الساعة 6 م'), {
      date: { year: 2026, month: 8, day: 1 },
      time: { hour: 18, minute: 0 },
      value: '2026-08-01T15:00:00.000Z',
    });
  });

  test('tomorrow crosses a year boundary', () => {
    assertComplete(parse('بكرة الساعة 6 م', {
      now: '2026-12-31T12:00:00.000Z',
    }), {
      date: { year: 2027, month: 1, day: 1 },
      time: { hour: 18, minute: 0 },
      value: '2027-01-01T15:00:00.000Z',
    });
  });

  for (const [weekday, expectedDate] of [
    ['الأحد', { year: 2026, month: 8, day: 9 }],
    ['الأربعاء', { year: 2026, month: 8, day: 5 }],
    ['السبت', { year: 2026, month: 8, day: 8 }],
  ]) {
    test(`${weekday} resolves to the closest upcoming occurrence`, () => {
      const result = parse(`${weekday} الساعة 6 م`, {
        now: '2026-08-03T09:00:00.000Z',
      });
      assert.deepEqual(result.date, expectedDate);
      assert.equal(result.complete, true);
    });
  }

  test('requesting the current weekday resolves to the following week', () => {
    const result = parse('الأربعاء الساعة 6 م', {
      now: '2026-08-05T09:00:00.000Z',
    });
    assert.deepEqual(result.date, { year: 2026, month: 8, day: 12 });
  });

  test('date-only input returns a missing-time partial value', () => {
    const result = parse('بكرة');
    assert.equal(result.complete, false);
    assert.equal(result.partial, true);
    assert.equal(result.missing, 'time');
    assert.equal(result.value, 'date:2026-08-01');
  });

  test('time-only input returns a missing-date partial value', () => {
    const result = parse('6 م');
    assert.equal(result.complete, false);
    assert.equal(result.partial, true);
    assert.equal(result.missing, 'date');
    assert.equal(result.value, 'time:18:00');
  });

  test('an hour without a period remains ambiguous', () => {
    const result = parse('الساعة 6');
    assert.equal(result.complete, false);
    assert.equal(result.ambiguousTime, true);
  });

  test('24-hour time parses correctly', () => {
    const result = parse('18:30');
    assert.equal(result.partial, true);
    assert.equal(result.missing, 'date');
    assert.deepEqual(result.time, { hour: 18, minute: 30 });
    assert.equal(result.value, 'time:18:30');
  });

  for (const [input, expected] of [
    ['12 ص', { hour: 0, minute: 0 }],
    ['12 م', { hour: 12, minute: 0 }],
  ]) {
    test(`${input} preserves the current 12-hour conversion`, () => {
      assert.deepEqual(parse(input).time, expected);
    });
  }

  test('Arabic-Indic digits normalize identically to Latin digits', () => {
    assert.deepEqual(
      parse('اليوم الساعة ٦ م'),
      parse('اليوم الساعة 6 م')
    );
  });

  test('today is derived from the supplied timezone, not the host timezone', () => {
    const now = '2026-08-01T22:30:00.000Z';
    const riyadh = parse('اليوم الساعة 6 م', {
      now,
      timeZone: 'Asia/Riyadh',
    });
    const utc = parse('اليوم الساعة 6 م', {
      now,
      timeZone: 'UTC',
    });
    assert.deepEqual(riyadh.date, { year: 2026, month: 8, day: 2 });
    assert.equal(riyadh.value, '2026-08-02T15:00:00.000Z');
    assert.deepEqual(utc.date, { year: 2026, month: 8, day: 1 });
    assert.equal(utc.value, '2026-08-01T18:00:00.000Z');
  });

  test('a previous date combines with a new time', () => {
    assertComplete(parse('6 م', {
      previousValue: 'date:2026-08-10',
    }), {
      date: { year: 2026, month: 8, day: 10 },
      time: { hour: 18, minute: 0 },
      value: '2026-08-10T15:00:00.000Z',
    });
  });

  test('a previous time combines with a new date', () => {
    assertComplete(parse('بكرة', {
      previousValue: 'time:18:00',
    }), {
      date: { year: 2026, month: 8, day: 1 },
      time: { hour: 18, minute: 0 },
      value: '2026-08-01T15:00:00.000Z',
    });
  });

  test('بعد بكرة at 6 PM advances two local calendar days', () => {
    assertComplete(parse('بعد بكرة الساعة 6 م', {
      now: '2026-08-10T09:00:00.000Z',
    }), {
      date: { year: 2026, month: 8, day: 12 },
      time: { hour: 18, minute: 0 },
      value: '2026-08-12T15:00:00.000Z',
    });
  });

  test('بعد بكرة alone returns a missing-time partial date', () => {
    const result = parse('  بعد   بكرة  ', {
      now: '2026-08-10T09:00:00.000Z',
    });
    assert.equal(result.complete, false);
    assert.equal(result.partial, true);
    assert.equal(result.missing, 'time');
    assert.equal(result.value, 'date:2026-08-12');
    assert.deepEqual(result.date, { year: 2026, month: 8, day: 12 });
  });

  test('بعد بكرة crosses the end of a month', () => {
    const result = parse('بعد بكرة الساعة 6 م', {
      now: '2026-07-30T09:00:00.000Z',
    });
    assert.deepEqual(result.date, { year: 2026, month: 8, day: 1 });
    assert.equal(result.value, '2026-08-01T15:00:00.000Z');
  });

  test('بعد بكرة crosses the end of a year', () => {
    const result = parse('بعد بكرة الساعة 6 م', {
      now: '2026-12-30T09:00:00.000Z',
    });
    assert.deepEqual(result.date, { year: 2027, month: 1, day: 1 });
    assert.equal(result.value, '2027-01-01T15:00:00.000Z');
  });

  test('بعد بكرة uses the local day in the supplied timezone', () => {
    const now = '2026-08-01T22:30:00.000Z';
    const riyadh = parse('بعد بكرة الساعة 6 م', {
      now,
      timeZone: 'Asia/Riyadh',
    });
    const utc = parse('بعد بكرة الساعة 6 م', {
      now,
      timeZone: 'UTC',
    });
    assert.deepEqual(riyadh.date, { year: 2026, month: 8, day: 4 });
    assert.equal(riyadh.value, '2026-08-04T15:00:00.000Z');
    assert.deepEqual(utc.date, { year: 2026, month: 8, day: 3 });
    assert.equal(utc.value, '2026-08-03T18:00:00.000Z');
  });

  test('بكرة remains plus one day while بعد بكرة is plus two', () => {
    const options = { now: '2026-08-10T09:00:00.000Z' };
    assert.deepEqual(
      parse('بكرة الساعة 6 م', options).date,
      { year: 2026, month: 8, day: 11 }
    );
    assert.deepEqual(
      parse('بعد بكرة الساعة 6 م', options).date,
      { year: 2026, month: 8, day: 12 }
    );
  });
});
