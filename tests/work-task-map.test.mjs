import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteWorkStore } from '../server/work-task-stores.mjs';
import { normalizeTaskMap } from '../server/work-task-map.mjs';

test('task map validates bounded procedures', () => {
  for (const body of [null, {}, { title: '절차', kind: 'daily', category: 'service', steps: [] }, { title: '절차', kind: 'daily', category: 'service', steps: [{ title: '', guide: '' }] }]) assert.throws(() => normalizeTaskMap(body), { status: 400 });
});
test('later steps can complete first and write an execution', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE recipients(id TEXT PRIMARY KEY,name TEXT,operational_name TEXT,is_draft INTEGER,enabled INTEGER); CREATE TABLE employment_contracts(id TEXT PRIMARY KEY,worker_name TEXT,contract_start_date TEXT,contract_end_date TEXT,is_draft INTEGER,enabled INTEGER);');
    const store = createSqliteWorkStore(db, () => true);
    const current = await store.members({ id: 'u', email: 'a@example.com', name: 'A' }, ['a@example.com']);
    const template = await store.saveTaskMap({ title: 'Parallel', kind: 'event', category: 'service', steps: [{ title: 'First', guide: '' }, { title: 'Second', guide: '' }] });
    const run = await store.startTaskMap({ templateId: template.id, date: '2026-01-01', assigneeId: current.assignees[0].id, related: [] }, current);
    const saved = await store.checkTaskMap(run.id, { version: 1, step: 1 }, current);
    assert.equal(saved.steps[0].completedAt, null);
    assert.ok(saved.steps[1].completedAt);
    assert.equal((await store.day('2026-01-01', 'all', current)).executions.length, 1);
  } finally { db.close(); }
});

test('bundle claims deduplicate, allow independent steps and enforce stale versions, and atomically write journal', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE recipients(id TEXT PRIMARY KEY,name TEXT,operational_name TEXT,is_draft INTEGER,enabled INTEGER); CREATE TABLE employment_contracts(id TEXT PRIMARY KEY,worker_name TEXT,contract_start_date TEXT,contract_end_date TEXT,is_draft INTEGER,enabled INTEGER); INSERT INTO recipients VALUES('r1','김미소','',0,1);`);
    const store = createSqliteWorkStore(db, () => true);
    const current = await store.members({ id: 'user', email: 'a@example.com', name: '완료자' }, ['a@example.com']);
    const template = await store.saveTaskMap({ title: '신규 수급자', kind: 'event', category: 'service', steps: [{ title: '서류', guide: '서식 확인' }, { title: '배정', guide: '' }] });
    const input = { templateId: template.id, date: '2026-01-01', assigneeId: current.assignees[0].id, related: [{ type: 'recipient', id: 'r1' }] };
    const run = await store.startTaskMap(input, current);
    assert.equal((await store.startTaskMap(input, current)).id, run.id);
    assert.equal((await store.list(current, 'all', 'all')).length, 0);
    await assert.rejects(store.checkTaskMap(run.id, { version: 1, step: 9 }, current), { status: 409 });
    const first = await store.checkTaskMap(run.id, { version: 1, step: 0 }, current);
    assert.equal(first.steps[0].completedBy, '완료자');
    await assert.rejects(store.checkTaskMap(run.id, { version: 1, step: 1 }, current), { status: 409 });
    assert.equal(db.prepare('SELECT count(*) AS n FROM work_executions').get().n, 1);
    db.exec("CREATE TRIGGER fail_map_write BEFORE UPDATE ON work_map_runs BEGIN SELECT RAISE(ABORT, 'injected failure'); END;");
    await assert.rejects(store.checkTaskMap(run.id, { version: 2, step: 1 }, current), /injected failure/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM work_executions').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM work_journal_events').get().n, 1);
    db.exec('DROP TRIGGER fail_map_write');
    await store.checkTaskMap(run.id, { version: 2, step: 1 }, current);
    const day = await store.day('2026-01-01', 'all', current);
    assert.equal(day.executions.length, 2);
    assert.equal(day.executions[0].snapshot.related[0].name, '김미소');
    assert.equal(db.prepare('SELECT count(*) AS n FROM work_journal_events').get().n, 2);
    const board = await store.taskMaps('2026-01');
    assert.equal(board.nodes[0].runs[0].templateId, template.id);
    assert.equal(board.nodes[0].state, 'green');
    const edited = await store.saveTaskMap({ id: template.id, version: 1, title: '수정한 절차', kind: 'event', category: 'service', steps: [{ title: '새 단계', guide: '' }] }, current);
    assert.equal(edited.version, 2);
    assert.equal((await store.taskMaps('2026-01')).runs[0].steps.length, 2, 'execution snapshots survive design edits');
    await assert.rejects(store.saveTaskMap({ ...edited, version: 1 }, current), { status: 409 });
    const legacyPayload = JSON.parse(db.prepare('SELECT payload FROM work_map_runs WHERE id=?').get(run.id).payload);
    delete legacyPayload.templateId;
    db.prepare('UPDATE work_map_runs SET payload=? WHERE id=?').run(JSON.stringify(legacyPayload), run.id);
    assert.equal((await store.taskMaps('2026-01')).nodes[0].runs[0].templateId, template.id, 'legacy runs retain their template link');
    await assert.rejects(store.taskMaps('2026-13'), { status: 400 });
    const future = await store.startTaskMap({ ...input, date: '9999-01-01' }, current);
    await assert.rejects(store.checkTaskMap(future.id, { version: 1, step: 0 }, current), { status: 400 });
    assert.equal(db.prepare('SELECT count(*) AS n FROM work_executions').get().n, 2);
  } finally { db.close(); }
});
