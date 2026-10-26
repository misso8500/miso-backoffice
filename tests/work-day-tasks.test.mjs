import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupDayTasks } from '../shared/work-day-tasks.mjs';

const task = (id, dueDate = null, status = 'open') => ({ id, dueDate, status });
test('daily groups keep every task once, prioritizing overdue and separating closed tasks', () => {
  const tasks = [task('overdue', '2026-10-25'), task('today', '2026-10-26'), task('future', '2026-10-28'), task('unassigned'), task('done', '2026-10-25', 'done'), task('cancelled', null, 'cancelled')];
  const groups = groupDayTasks(tasks, '2026-10-26', { plans: [{ taskId: 'overdue', status: 'planned' }], executions: [] });
  assert.deepEqual(groups.map(g => [g.title, g.rows.map(t => t.id)]), [
    ['기한 지남', ['overdue']], ['선택일 할 일', ['today']], ['그 외 업무', ['future', 'unassigned']], ['완료한 업무', ['done']], ['취소한 업무', ['cancelled']]
  ]);
  assert.equal(groups.flatMap(g => g.rows).length, tasks.length);
});
test('selected-day plans and actual work both qualify; cancelled records do not', () => {
  const groups = groupDayTasks(['planned', 'performed', 'cancelled', 'voided'].map(id => task(id)), '2026-10-26', {
    plans: [{ taskId: 'planned', status: 'planned' }, { taskId: 'cancelled', status: 'cancelled' }],
    executions: [{ taskId: 'performed', status: 'recorded' }, { taskId: 'voided', status: 'voided' }, { taskId: null, status: 'recorded' }]
  });
  assert.deepEqual(groups[0].rows.map(t => t.id), ['planned', 'performed']);
  assert.deepEqual(groups[1].rows.map(t => t.id), ['cancelled', 'voided']);
});
test('tasks remain accessible before day records load and empty groups stay hidden', () => {
  assert.deepEqual(groupDayTasks([], '2026-10-26', null), []);
  assert.equal(groupDayTasks([task('later')], '2026-10-26', null)[0].rows[0].id, 'later');
});
