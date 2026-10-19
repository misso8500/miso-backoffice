import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workCalendarRange, moveWorkCalendar, workAssigneeInitial, weeklyWorkRecords } from '../shared/work-calendar.mjs';

test('calendar ranges start on Monday across year and leap month boundaries', () => {
  assert.deepEqual(workCalendarRange('2026-01-01','week'), { from: '2025-12-29', to: '2026-01-04', dates: ['2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-03','2026-01-04'] });
  const leap = workCalendarRange('2024-02-29','month');
  assert.equal(leap.dates.length,42); assert.equal(leap.from,'2024-01-29'); assert.equal(leap.to,'2024-03-10');
  assert(leap.dates.includes('2024-02-29')); assert.equal(new Set(leap.dates).size,42);
  assert.deepEqual(workCalendarRange('2026-10-19','day').dates,['2026-10-19']);
  const earliest = workCalendarRange('1000-01-01','week');
  assert.equal(new Date(earliest.to).getUTCDay(),0);
});
test('calendar navigation clamps month ends and supported date boundaries', () => {
  assert.equal(moveWorkCalendar('2024-01-31','month',1),'2024-02-29');
  assert.equal(moveWorkCalendar('2026-03-31','month',-1),'2026-02-28');
  assert.equal(moveWorkCalendar('2026-12-31','month',1),'2027-01-31');
  assert.equal(moveWorkCalendar('2026-01-01','week',-1),'2025-12-25');
  for (const mode of ['day','week','month']) {
    assert.equal(moveWorkCalendar('1000-01-01',mode,-1),'1000-01-01');
    assert.equal(moveWorkCalendar('9999-12-31',mode,1),'9999-12-31');
    for (const edge of ['1000-01-01','9999-12-31']) {
      const range = workCalendarRange(edge,mode);
      assert(range.from >= '1000-01-01' && range.to <= '9999-12-31');
      assert.equal(new Set(range.dates).size,range.dates.length);
    }
  }
  for (const invalid of ['2026-02-30','2026-1-1','0001-01-01','10000-01-01','']) assert.throws(() => workCalendarRange(invalid,'week'));
  assert.throws(() => moveWorkCalendar('2026-10-19','week',0));
});
test('white roster stickers use the surname initial in the fixed roster order', () => {
  assert.deepEqual(['신수연','박준규','황영상'].map(workAssigneeInitial),['ㅅ','ㅂ','ㅎ']);
  assert.equal(workAssigneeInitial(''),'?'); assert.equal(workAssigneeInitial('Alex'),'A');
});

test('weekly cards show actual work before plans before deadlines across different dates', () => {
  const data = {
    plans: [
      { id: 'p1', taskId: 'done', assigneeId: 'a', status: 'planned', date: '2026-10-19' },
      { id: 'p2', taskId: 'planned', assigneeId: 'a', status: 'planned', date: '2026-10-20' }
    ],
    executions: [{ id: 'e1', taskId: 'done', assigneeId: 'a', status: 'recorded', date: '2026-10-21' }],
    deadlines: [{ id: 'done', dueDate: '2026-10-23' }, { id: 'planned', dueDate: '2026-10-24' }, { id: 'due', dueDate: '2026-10-25' }]
  };
  const before = structuredClone(data), result = weeklyWorkRecords(data);
  assert.deepEqual(result.plans.map(p => p.id),['p2']);
  assert.deepEqual(result.executions.map(e => e.id),['e1']);
  assert.deepEqual(result.deadlines.map(t => t.id),['due']);
  assert.equal(result.executions[0].date,'2026-10-21');
  assert.deepEqual(data,before); // Rendering must not erase underlying plans or dates.
});

test('weekly priority keeps each colleague and standalone actual record visible', () => {
  const plans = [
    { taskId: 'shared', assigneeId: 'a', status: 'planned' },
    { taskId: 'shared', assigneeId: 'b', status: 'planned' }
  ];
  const executions = [
    { taskId: 'shared', assigneeId: 'a', status: 'recorded' },
    { taskId: null, assigneeId: 'a', status: 'recorded' },
    { taskId: null, assigneeId: 'a', status: 'recorded' }
  ];
  const result = weeklyWorkRecords({ plans, executions, deadlines: [{ id: 'shared' }] });
  assert.deepEqual(result.plans,[plans[1]]); assert.equal(result.executions.length,3); assert.equal(result.deadlines.length,0);
});

test('cancelled actual work falls back to the plan, and cancelled plans to the deadline', () => {
  const data = {
    plans: [{ taskId: 'task', assigneeId: 'a', status: 'planned' }],
    executions: [{ taskId: 'task', assigneeId: 'a', status: 'voided' }], deadlines: [{ id: 'task' }]
  };
  const planned = weeklyWorkRecords(data);
  assert.equal(planned.executions.length,0); assert.equal(planned.plans.length,1); assert.equal(planned.deadlines.length,0);
  data.plans[0].status = 'cancelled';
  const due = weeklyWorkRecords(data);
  assert.equal(due.plans.length,0); assert.equal(due.deadlines.length,1);
});
