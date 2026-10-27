import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recurrenceDates, recurrenceTitle } from '../shared/work-recurrence.mjs';
test('monthly deadlines clamp to each month end including leap years', () => {
  assert.deepEqual(recurrenceDates({ kind: 'monthly', dueDay: 31 }, '2026-02'), ['2026-02-28']);
  assert.deepEqual(recurrenceDates({ kind: 'monthly', dueDay: 30 }, '2028-02'), ['2028-02-29']);
});
test('daily rules independently include weekends and leave without changing the template', () => {
  const rule = { kind: 'daily', includeSaturday: false, includeSunday: false, includeLeave: false };
  const dates = recurrenceDates(rule, '2026-10', ['2026-10-05']);
  assert(!dates.includes('2026-10-03')); assert(!dates.includes('2026-10-04')); assert(!dates.includes('2026-10-05')); assert(dates.includes('2026-10-01'));
  assert.equal(recurrenceDates({ ...rule, includeSaturday: true, includeSunday: true, includeLeave: true }, '2026-10').length, 31);
  assert.equal(recurrenceTitle('RFID <YYMMDD> 체크', '2026-10-01'), 'RFID 261001 체크');
});
