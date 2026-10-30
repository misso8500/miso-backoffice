import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trafficBoard, monthDates } from '../shared/work-traffic.mjs';
const template = { id: 't', title: '일일 점검', kind: 'daily', category: 'service', steps: [{ title: '확인' }], schedule: { assigneeId: 'a', startDate: '2026-10-01', weekdays: [1,2,3,4,5] } };
const run = (date, done = true, extra = {}) => ({ id: date, templateId: 't', date, assigneeId: 'a', related: [], steps: [{ completedAt: done ? date+'T12:00:00Z' : null }], ...extra });
const board = (t = template, runs = [], today = '2026-10-02') => trafficBoard([t], runs, '2026-10', today)[0];
test('monthly traffic counts expected weekdays, including unclaimed missing days', () => {
  const node = board(template, [run('2026-10-01')]);
  assert.equal(node.expected, 22); assert.equal(node.due, 2); assert.equal(node.completed, 1); assert.equal(node.state, 'yellow');
  assert.equal(board(template, [run('2026-10-01')], '2026-10-05').state, 'red');
  assert.equal(board(template, [run('2026-10-01'), run('2026-10-02')]).state, 'green');
  assert.equal(board(template, [run('2026-10-01', true, { assigneeId: 'b' })]).completed, 0);
  assert.equal(board(template, [run('2026-10-01', true, { related: [{ id: 'r' }] })]).completed, 0);
});
test('start date and future month never fabricate missed checks', () => {
  assert.equal(board({ ...template, schedule: { ...template.schedule, startDate: '2026-11-01' } }).state, 'idle');
  assert.equal(board(template, [], '2026-09-30').state, 'idle');
  assert.equal(monthDates('2024-02').length, 29);
});
test('monthly due day clamps to end of month and daily completion does not complete a month', () => {
  const t = { ...template, kind: 'monthly', dueDay: 31, schedule: { ...template.schedule, startDate: '2026-01-01' } };
  const node = trafficBoard([t], [], '2026-02', '2026-03-01')[0];
  assert.equal(node.cells.find(c => c.required).date, '2026-02-28');
  assert.equal(node.state, 'red');
  assert.equal(board(template, [run('2026-10-01')], '2026-10-30').state, 'red');
});
test('event chains carry over months and stop carrying after completion month', () => {
  const t = { ...template, kind: 'event', schedule: undefined };
  const pending = run('2026-09-30', false, { dueDate: '2026-10-03' });
  assert.equal(board(t, [pending], '2026-10-02').state, 'yellow');
  assert.equal(board(t, [pending], '2026-10-04').state, 'red');
  const done = { ...pending, steps: [{ completedAt: '2026-10-02T12:00:00Z' }] };
  assert.equal(board(t, [done]).runs.length, 1);
  assert.equal(trafficBoard([t], [done], '2026-11', '2026-11-02')[0].runs.length, 0);
});
test('changing a schedule preserves earlier months and the assigned person for each date', () => {
  const revised = { ...template, scheduleHistory: [{ schedule: template.schedule, dueDay: 25 }], schedule: { assigneeId: 'b', startDate: '2026-11-01', weekdays: [1] } };
  const october = board(revised, [run('2026-10-01')]);
  assert.equal(october.expected, 22);
  assert.equal(october.completed, 1);
  const november = trafficBoard([revised], [], '2026-11', '2026-11-02')[0];
  assert.equal(november.expected, 5);
});
