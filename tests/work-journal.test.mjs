import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { normalizeWorkTask } from '../server/work-tasks.mjs';
import { createSqliteWorkStore, createPostgresWorkStore } from '../server/work-task-stores.mjs';
import { workDate } from '../server/work-journal.mjs';

const sql = name => readFileSync(new URL(`../server/${name}`, import.meta.url), 'utf8');
async function setup(t, mode) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE recipients(id TEXT PRIMARY KEY,name TEXT,operational_name TEXT,is_draft INTEGER,enabled INTEGER);
    CREATE TABLE employment_contracts(id TEXT PRIMARY KEY,worker_name TEXT,contract_start_date TEXT,contract_end_date TEXT,is_draft INTEGER,enabled INTEGER);
    INSERT INTO recipients VALUES('r1','수급자','구분',1,1);`);
  let locks = 0;
  const bridge = { async connect() { return { async query(statement, params = []) {
    if (['BEGIN','COMMIT','ROLLBACK'].includes(statement)) { db.exec(statement); return { rows: [] }; }
    if (statement.endsWith(' FOR UPDATE')) locks++;
    const values = [], converted = statement.replace(/ FOR UPDATE$/, '').replace(/\$(\d+)/g, (_, n) => { values.push(params[Number(n)-1]); return '?'; });
    const rows = db.prepare(converted).all(...values); return { rows, rowCount: rows.length };
  }, release() {} }; } };
  if (mode === 'postgres-adapter') db.exec(sql('work-task-schema.sql') + sql('work-journal-schema.sql'));
  const store = mode === 'sqlite' ? createSqliteWorkStore(db, () => true) : createPostgresWorkStore(bridge, () => true);
  const current = await store.members({ id: 'google-a', email: 'a@example.com', name: '입력자 A' }, ['a@example.com','b@example.com']);
  const other = await store.members({ id: 'google-b', email: 'b@example.com', name: '입력자 B' }, ['a@example.com','b@example.com']);
  const actor = current.assignees[0].id, colleague = current.assignees[1].id;
  const createTask = async (title = '원래 업무') => store.create(normalizeWorkTask({ title, description: '', category: 'operations', assigneeId: actor, dueDate: '', related: [{ type: 'recipient', id: 'r1' }] }), current);
  const plan = (task, overrides = {}) => ({ requestId: randomUUID(), taskId: task.id, assigneeId: actor, date: '2000-10-19', period: 'morning', ...overrides });
  return { db, store, current, other, actor, colleague, createTask, plan, locks: () => locks };
}

for (const mode of ['sqlite','postgres-adapter']) {
  test(`${mode}: actual work can occur after the plan, remains linked, and can be corrected without duplicates`, async t => {
    const { store, current, other, colleague, createTask, plan } = await setup(t, mode);
    const task = await createTask(), p = await store.createPlan(plan(task), current);
    const request = { requestId: randomUUID(), period: 'afternoon', date: '2000-10-20', executionVersion: 0 };
    let e = await store.recordPlan(p.id, request, current);
    assert.equal(e.date, '2000-10-20'); assert.equal(e.planId, p.id);
    const original = await store.day(p.date, 'all', current);
    assert.equal(original.plans[0].date, p.date); assert.equal(original.executions.length, 0); assert.equal(original.linkedExecutions[0].id, e.id);
    assert.equal((await store.recordPlan(p.id, request, current)).id, e.id);
    await assert.rejects(store.recordPlan(p.id, { ...request, requestId: randomUUID(), date: p.date }, other), { status: 409 });
    e = await store.updateExecution(e.id, { version: e.version, date: '2000-10-21', period: 'morning', content: '실제 처리일 정정', assigneeId: colleague }, other);
    assert.equal(e.date, '2000-10-21'); assert.equal(e.assigneeId, colleague); assert.equal(e.createdBy, current.me.id); assert.equal(e.updatedBy, other.me.id);
    assert.equal((await store.day('2000-10-20', 'all', current)).executions.length, 0);
    assert.equal((await store.day('2000-10-21', colleague, current)).executions[0].id, e.id);
    assert.equal((await store.day(p.date, 'all', current)).linkedExecutions[0].date, e.date);
    await assert.rejects(store.updateExecution(e.id, { version: e.version, date: '9999-01-01', period: 'morning', content: '미래 기록', assigneeId: colleague }, current), { status: 400 });
    await assert.rejects(store.recordPlan(p.id, { ...request, requestId: randomUUID(), date: '2000-02-30', executionVersion: e.version }, current), { status: 400 });
    e = await store.recordPlan(p.id, { ...request, requestId: randomUUID(), date: p.date, executionVersion: e.version }, current);
    assert.equal(e.date, p.date); assert.equal(e.assigneeId, colleague);
    assert.equal((await store.calendar('2000-10-19', '2000-10-22', 'all', current)).executions.length, 1);
    await store.cancelExecution(e.id, e.version, current);
    assert.equal((await store.day(p.date, 'all', current)).linkedExecutions.length, 0);
  });
  test(`${mode}: actual performer can change without changing the plan or duplicating execution`, async t => {
    const { db, store, current, other, actor, colleague, createTask, plan } = await setup(t, mode);
    const task = await createTask();
    const p = await store.createPlan(plan(task), current);
    const execution = await store.recordPlan(p.id, { requestId: randomUUID(), period: 'morning', executionVersion: 0 }, current);
    const saved = await store.updateExecution(execution.id, { version: execution.version, content: '동료가 대신 처리', period: 'afternoon', assigneeId: colleague }, other);
    assert.equal(saved.assigneeId, colleague); assert.equal(saved.createdBy, current.me.id); assert.equal(saved.updatedBy, other.me.id);
    assert.equal(saved.planId, p.id); assert.equal(saved.date, p.date);
    assert.equal((await store.day(p.date, actor, current)).executions.length, 0);
    assert.equal((await store.day(p.date, colleague, current)).executions[0].id, execution.id);
    assert.equal((await store.day(p.date, actor, current)).plans[0].assigneeId, actor);
    const quick = await store.recordPlan(p.id, { requestId: randomUUID(), period: 'morning', executionVersion: saved.version }, current);
    assert.equal(quick.id, saved.id); assert.equal(quick.assigneeId, colleague);
    assert.equal((await store.day(p.date, 'all', current)).executions.length, 1);
    await assert.rejects(store.updateExecution(saved.id, { version: saved.version, content: '오래된 수정', period: 'morning', assigneeId: actor }, current), { status: 409 });
    await assert.rejects(store.updateExecution(saved.id, { version: quick.version, content: '잘못된 수행자', period: 'morning', assigneeId: 'unknown' }, current), { status: 400 });
    const payload = JSON.parse(db.prepare("SELECT payload FROM work_journal_events WHERE entity_id=? AND action='updated'").get(saved.id).payload);
    assert.equal(payload.assigneeId, colleague); assert.equal(payload.updatedBy, other.me.id);
  });
  test(`${mode}: calendar respects record dates, historical performers and global scheduling`, async t => {
    const { store, current, other, actor, colleague, createTask, plan } = await setup(t, mode);
    const task = await createTask('원래 담당 업무');
    const p = await store.createPlan(plan(task, { date: '2000-12-31' }), current);
    const execution = await store.recordPlan(p.id, { requestId: randomUUID(), period: 'morning', executionVersion: 0 }, other);
    const changed = await store.update(task.id, normalizeWorkTask({ title: '배정 변경 후', description: '', category: 'staff', assigneeId: colleague, dueDate: '2001-01-01', related: [] }),task.version,current);
    const outside = await createTask('다른 기간에 계획 있음');
    await store.createPlan(plan(outside, { date: '2002-01-01' }),current);
    const unassigned = await store.create(normalizeWorkTask({ title: '담당자 미정 업무', category: 'operations', related: [], dueDate: '2001-01-02' }),current);
    const noPlan = await createTask('미배치 업무');
    const undonePlan = await store.createPlan(plan(noPlan, { date: '2000-12-30' }),current);
    await store.cancelPlan(undonePlan.id,undonePlan.version,current);
    const all = await store.calendar('2000-12-25','2001-01-07','all',current);
    assert.equal(all.plans.length,1); assert.equal(all.executions.length,1);
    assert.equal(all.plans[0].snapshot.title,'원래 담당 업무');
    assert.equal(all.executions[0].assigneeId,actor); assert.equal(all.executions[0].createdBy,other.me.id);
    assert.deepEqual(new Set(all.unplanned.map(t => t.id)),new Set([unassigned.id,noPlan.id]));
    assert.deepEqual(new Set(all.deadlines.map(t => t.id)),new Set([task.id,unassigned.id]));
    const byActor = await store.calendar(all.from,all.to,actor,current);
    assert.equal(byActor.executions.length,1); assert.equal(byActor.deadlines.length,0);
    const byColleague = await store.calendar(all.from,all.to,colleague,current);
    assert.equal(byColleague.plans.length,0); assert.equal(byColleague.deadlines[0].id,task.id);
    const unknown = await store.calendar(all.from,all.to,'unassigned',current);
    assert.equal(unknown.plans.length,0); assert.equal(unknown.executions.length,0); assert.equal(unknown.unplanned[0].id,unassigned.id);
    const done = await store.complete(task.id,changed.version,current);
    assert(!(await store.calendar(all.from,all.to,'all',current)).deadlines.some(t => t.id === task.id));
    await store.cancel(task.id,done.version,current);
    const afterCancel = await store.calendar(all.from,all.to,'all',current);
    assert.equal(afterCancel.plans.length,0); assert.equal(afterCancel.executions.length,1);
    await store.cancelExecution(execution.id,execution.version,current);
    assert.equal((await store.calendar(all.from,all.to,'all',current)).executions.length,0);
    assert.equal((await store.calendar('2000-12-31','2000-12-31','all',current)).deadlines.length,0);
    for (const args of [['2001-01-02','2001-01-01','all'],['2001-01-01','2001-04-01','all'],['2001-02-29','2001-03-01','all'],['2001-01-01','2001-01-02',current.me.id]]) {
      await assert.rejects(async () => store.calendar(...args,current),{ status: 400 });
    }
  });
  test(`${mode}: plans, per-person daily isolation, snapshots and execution lifecycle`, async t => {
    const { db, store, current, other, actor, colleague, createTask, plan, locks } = await setup(t, mode);
    const task = await createTask(), body = plan(task), p = await store.createPlan(body, current);
    assert.equal((await store.createPlan(body, current)).id, p.id);
    await assert.rejects(async () => store.createPlan(plan(task), other), { status: 409 });
    await assert.rejects(async () => store.createPlan(plan(task, { assigneeId: current.me.id }), current), { status: 400 });
    await store.createPlan(plan(task, { assigneeId: colleague }), other);
    await store.createPlan(plan(task, { date: '2000-10-20' }), other);
    const changed = await store.update(task.id, normalizeWorkTask({ title: '나중에 수정한 제목', description: '', category: 'staff', assigneeId: actor, dueDate: '', related: [] }), task.version, current);
    const before = await store.day(body.date, actor, current);
    assert.equal(before.plans.length, 1); assert.equal(before.plans[0].snapshot.title, '원래 업무'); assert.equal(before.plans[0].snapshot.related[0].name, '수급자');
    assert.equal((await store.day(body.date, 'all', current)).plans.length, 2);
    assert.equal((await store.day('2000-10-20', actor, current)).plans.length, 1);
    const quick = { requestId: randomUUID(), period: 'morning', executionVersion: 0 };
    let e = await store.recordPlan(p.id, quick, other);
    assert.equal(e.assigneeId, actor); assert.equal(e.createdBy, other.me.id); assert.equal(e.date, body.date); assert.equal(e.content, '원래 업무');
    assert.equal((await store.recordPlan(p.id, quick, other)).id, e.id);
    assert.equal((await store.recordPlan(p.id, { ...quick, requestId: randomUUID() }, current)).id, e.id);
    e = await store.recordPlan(p.id, { requestId: randomUUID(), period: 'afternoon', executionVersion: e.version }, current);
    assert.equal(e.version, 2);
    await assert.rejects(async () => store.recordPlan(p.id, { requestId: randomUUID(), period: 'morning', executionVersion: 1 }, other), { status: 409 });
    e = await store.updateExecution(e.id, { version: e.version, period: 'afternoon', content: '실제로 자료 취합만 수행' }, other);
    assert.equal(e.snapshot.title, '원래 업무'); assert.equal(e.content, '실제로 자료 취합만 수행');
    const done = await store.complete(task.id, changed.version, current);
    assert.equal(done.status, 'done'); assert.equal((await store.list(current, 'all', 'open')).length, 0);
    assert.equal((await store.list(current, 'all', 'done')).length, 1);
    assert.equal((await store.day(body.date, actor, current)).executions.length, 1);
    await assert.rejects(async () => store.createPlan(plan(task, { date: '2000-10-21' }), current), { status: 409 });
    const reopened = await store.complete(task.id, done.version, other, true); assert.equal(reopened.status, 'open');
    await store.cancelPlan(p.id, p.version, current);
    assert.equal((await store.day(body.date, actor, current)).executions[0].status, 'recorded');
    await store.cancel(task.id, reopened.version, current);
    const day = await store.day(body.date, 'all', current);
    assert(day.plans.every(p => p.status === 'cancelled')); assert.equal(day.executions[0].status, 'recorded');
    await store.cancelExecution(e.id, e.version, current);
    assert.equal((await store.day(body.date, actor, current)).executions[0].status, 'voided');
    assert(db.prepare('SELECT COUNT(*) AS n FROM work_journal_events').get().n >= 8);
    if (mode === 'postgres-adapter') assert(locks() > 0);
  });

  test(`${mode}: manual work, cancelled quick retries, future dates and atomic rollback`, async t => {
    const { db, store, current, actor, createTask, plan } = await setup(t, mode);
    const task = await createTask(), p = await store.createPlan(plan(task), current);
    const quick = { requestId: randomUUID(), period: 'morning', executionVersion: 0 };
    const e = await store.recordPlan(p.id, quick, current); await store.cancelExecution(e.id, e.version, current);
    await assert.rejects(async () => store.recordPlan(p.id, quick, current), { status: 409 });
    const fresh = await store.recordPlan(p.id, { ...quick, requestId: randomUUID() }, current); assert.notEqual(fresh.id, e.id);
    const manual = { requestId: randomUUID(), date: '2000-10-19', assigneeId: actor, period: 'unknown', content: '돌발 전화 상담', category: 'recipient', related: [{ type: 'recipient', id: 'r1' }] };
    const m = await store.recordManual(manual, current); assert.equal(m.planId, null); assert.equal(m.taskId, null); assert.equal(m.period, 'unknown');
    assert.equal((await store.recordManual(manual, current)).id, m.id);
    await assert.rejects(async () => store.recordManual({ ...manual, date: '2999-01-01', requestId: randomUUID() }, current), { status: 400 });
    await assert.rejects(async () => store.recordManual({ ...manual, content: ' ' }, current), { status: 400 });
    const future = await store.createPlan(plan(task, { date: '2999-01-01' }), current);
    await assert.rejects(async () => store.recordPlan(future.id, { ...quick, requestId: randomUUID() }, current), { status: 400 });
    db.exec("CREATE TRIGGER reject_journal_event BEFORE INSERT ON work_journal_events BEGIN SELECT RAISE(ABORT,'test rollback'); END");
    await assert.rejects(async () => store.recordManual({ ...manual, requestId: randomUUID(), content: '저장 실패' }, current));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM work_executions WHERE content='저장 실패'").get().n, 0);
    await assert.rejects(async () => store.cancel(task.id, task.version, current));
    assert.equal((await store.list(current, 'all', 'open'))[0].status, 'open');
    assert.equal((await store.day('2000-10-19', actor, current)).plans[0].status, 'planned');
  });
}

test('journal date validation and Postgres RLS bootstrap cover every journal table', () => {
  assert.throws(() => workDate('2026-02-30'), { status: 400 }); assert.throws(() => workDate('2026-1-1'), { status: 400 }); assert.equal(workDate('2024-02-29'), '2024-02-29');
  const pg = sql('postgres/schema.sql'); assert(pg.includes(sql('work-journal-schema.sql')));
  for (const table of ['work_plans','work_executions','work_journal_events']) {
    assert(pg.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)); assert(pg.includes(`REVOKE ALL ON TABLE ${table} FROM anon, authenticated`));
  }
});
