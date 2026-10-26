import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDayEntries } from '../shared/work-calendar-entries.mjs';
test('calendar preserves plan, actual and deadline dates instead of suppressing earlier records', () => {
  const data = { plans: [{ id: 'p', taskId: 't', assigneeId: 'a', date: '2026-10-26', status: 'planned', snapshot: { title: '계획' } }], executions: [{ id: 'e', taskId: 't', assigneeId: 'a', date: '2026-10-27', status: 'recorded', content: '수행' }], deadlines: [{ id: 't', assigneeId: 'a', dueDate: '2026-10-28', title: '마감' }] };
  for (const [day, kind] of [['26', 'plan'], ['27', 'execution'], ['28', 'deadline']]) assert.deepEqual(calendarDayEntries(data, [], `2026-10-${day}`)[0].kinds, [kind]);
});
test('merge same-day records only for the same task and performer, preserving standalone actual work', () => {
  const day = '2026-10-26';
  const data = { plans: [{ id: 'p', taskId: 't', assigneeId: 'a', date: day, status: 'planned', snapshot: { title: '옛 제목' } }, { id: 'p2', taskId: 't', assigneeId: 'b', date: day, status: 'planned', snapshot: { title: '옛 제목' } }], executions: [{ id: 'e', taskId: 't', assigneeId: 'a', date: day, status: 'recorded', content: '실행' }, { id: 'manual', taskId: null, assigneeId: 'a', date: day, status: 'recorded', content: '돌발 업무' }, { id: 'void', taskId: 't', assigneeId: 'c', date: day, status: 'voided' }], deadlines: [{ id: 't', assigneeId: 'a', dueDate: day, title: '기한' }] };
  const result = calendarDayEntries(data, [{ id: 't', title: '수정한 제목', status: 'done' }], day);
  assert.equal(result.length, 3);
  assert.deepEqual(result[0].kinds, ['plan', 'execution', 'deadline']);
  assert.equal(result[0].title, '수정한 제목'); assert.equal(result[0].task.status, 'done');
  assert.deepEqual(result[1].kinds, ['plan']); assert.equal(result[1].owner, 'b');
  assert.equal(result[2].taskId, null); assert.equal(result[2].title, '돌발 업무');
});
