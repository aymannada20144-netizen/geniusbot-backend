'use strict';

const DEFAULT_TIME_ZONE = 'Asia/Riyadh';

function parsePreferredStart(text, previousValue, policy, options = {}) {
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const now = options.now instanceof Date ? options.now : new Date();
  const normalized = policy.normalize(text);
  const previous = parsePartialPreferredStart(previousValue);
  const date = parseDatePart(normalized, now, timeZone) || previous.date;
  const time = parseTimePart(stripExplicitDate(normalized)) || previous.time;

  if (date && time) {
    return {
      complete: true,
      value: zonedLocalToIso({ ...date, ...time }, timeZone),
      date,
      time,
    };
  }
  if (date) {
    return {
      complete: false,
      partial: true,
      missing: 'time',
      value: `date:${date.year}-${pad(date.month)}-${pad(date.day)}`,
      date,
      ambiguousTime: hasAmbiguousTime(normalized),
    };
  }
  if (time) {
    return {
      complete: false,
      partial: true,
      missing: 'date',
      value: `time:${pad(time.hour)}:${pad(time.minute)}`,
      time,
    };
  }
  return { complete: false, partial: false, ambiguousTime: hasAmbiguousTime(normalized) };
}

function parseTimePart(text) {
  const match = String(text || '').match(
    /(?:^|\s)(?:الساعه|الساعة|at)?\s*(\d{1,2})(?::(\d{2}))?\s*(صباحا|صباح|ص|am|مساء|مساءا|م|pm)?(?=\s|$)/u
  );
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3] || null;
  if (minute > 59) return null;
  if (!period && match[2] === undefined && hour <= 12) return null;
  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (['مساء', 'مساءا', 'م', 'pm'].includes(period) && hour < 12) hour += 12;
    if (['صباحا', 'صباح', 'ص', 'am'].includes(period) && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return { hour, minute };
}

function hasAmbiguousTime(text) {
  return /(?:^|\s)(?:الساعه|الساعة)?\s*(?:[1-9]|1[0-2])(?:\s|$)/u.test(text);
}

function parsePartialPreferredStart(value) {
  if (typeof value !== 'string') return {};
  const date = value.match(/^date:(\d{4})-(\d{2})-(\d{2})$/);
  if (date) return { date: { year: Number(date[1]), month: Number(date[2]), day: Number(date[3]) } };
  const time = value.match(/^time:(\d{2}):(\d{2})$/);
  if (time) return { time: { hour: Number(time[1]), minute: Number(time[2]) } };
  return {};
}

function parseDatePart(text, now, timeZone) {
  const today = localDateParts(now, timeZone);
  if (/(^|\s)(اليوم|today)(\s|$)/u.test(text)) return today;
  if (/(^|\s)(بكره|بكرة|غدا|غدا|tomorrow)(\s|$)/u.test(text)) return addDays(today, 1);
  const explicit = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/) ||
    text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (explicit) {
    return explicit[1].length === 4
      ? validDateParts(Number(explicit[1]), Number(explicit[2]), Number(explicit[3]))
      : validDateParts(Number(explicit[3]), Number(explicit[2]), Number(explicit[1]));
  }
  const weekdays = ['الاحد', 'الاثنين', 'الثلاثاء', 'الاربعاء', 'الخميس', 'الجمعه', 'السبت'];
  const weekday = weekdays.findIndex((name) => text.includes(name));
  if (weekday < 0) return null;
  const todayWeekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  let daysAhead = (weekday - todayWeekday + 7) % 7;
  if (daysAhead === 0) daysAhead = 7;
  return addDays(today, daysAhead);
}

function stripExplicitDate(text) {
  return text
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/u, ' ')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/u, ' ');
}

function localDateParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function zonedLocalToIso(parts, timeZone) {
  let timestamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(new Date(timestamp), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const desiredAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    timestamp += desiredAsUtc - actualAsUtc;
  }
  return new Date(timestamp).toISOString();
}

function zonedParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return Object.fromEntries(['year', 'month', 'day', 'hour', 'minute'].map((key) => [key, Number(values[key])]));
}

function addDays(parts, count) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + count));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function validDateParts(year, month, day) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day
    ? { year, month, day }
    : null;
}

function pad(value) { return String(value).padStart(2, '0'); }

module.exports = { parsePreferredStart, parseTimePart, DEFAULT_TIME_ZONE };
