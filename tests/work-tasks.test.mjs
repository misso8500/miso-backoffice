import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { normalizeWorkTask } from '../server/work-tasks.mjs';
import { createSqliteWorkStore, createPostgresWorkStore } from '../server/work-task-stores.mjs';

const userA = { id: 'google-a', email: 'a@example.com', name: '센터장' };
const userB = { id: 'google-b', email: 'b@example.com', name: '사회복지사' };
const emails = ['a@example.com', 'b@example.com', 'c@example.com'];
const input = overrides => normalizeWorkTask({ title: '급여계산', description: '', category: 'operations', dueDate: '2026-10-23', assigneeId: '', related: [], ...overrides });
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE recipients(id TEXT PRIMARY KEY,name TEXT,operational_name TEXT,is_draft INTEGER,enabled INTEGER);
    CREATE TABLE employment_contracts(id TEXT PRIMARY KEY,worker_name TEXT,contract_start_date TEXT,contract_end_date TEXT,is_draft INTEGER,enabled INTEGER);
    INSERT INTO recipients VALUES('r1','수급자 A','구분 정보',1,1);
    INSERT INTO employment_contracts VALUES('w1','근로자 A','2026-01-01','',1,1);`);
  return db;
}

test('work validation rejects false dates, unsafe shapes and uncontrolled categories', () => {
  for (const body of [{ title: ' ' }, { title: 'x'.repeat(501) }, { description: {} }, { dueDate: '2026-02-30' }, { category: 'official-evaluation-pass' }, { related: [{ type: 'user', id: 'x' }] }, { related: Array.from({ length: 31 }, () => ({ type: 'recipient', id: 'r1' })) }]) assert.throws(() => input(body), { status: 400 });
  assert.equal(input({ dueDate: '2024-02-29' }).dueDate, '2024-02-29');
  assert.deepEqual(input({ related: [{ type: 'recipient', id: 'r1' }, { type: 'recipient', id: 'r1' }] }).related, [{ type: 'recipient', id: 'r1' }]);
});

for (const mode of ['sqlite', 'postgres-adapter']) test(`${mode}: members, cross-user updates, stale writes, cancellation, and event rollback`, async t => {
  const db = database(); t.after(() => db.close());
  let releases = 0;
  const bridge = { async connect() { return { async query(sql, params = []) {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) { db.exec(sql); return { rows: [], rowCount: 0 }; }
    const values = [], converted = sql.replace(/\$(\d+)/g, (_, n) => { values.push(params[Number(n) - 1]); return '?'; });
    const rows = db.prepare(converted).all(...values); return { rows, rowCount: rows.length };
  }, release() { releases++; } }; } };
  const make = () => mode === 'sqlite' ? createSqliteWorkStore(db, () => true) : createPostgresWorkStore(bridge, () => true);
  if (mode === 'postgres-adapter') db.exec(readFileSync(new URL('../server/work-task-schema.sql', import.meta.url), 'utf8'));
  const store = make(), a = await store.members(userA, emails), b = await store.members(userB, emails);
  assert.equal(a.members.length, 3); assert.deepEqual(a.assignees.map(m => m.name), ['신수연', '박준규', '황영상']); assert.deepEqual(b.assignees, a.assignees); assert.equal(b.members.find(m => m.email === userA.email).name, '센터장');
  assert.equal((await store.members(userA, emails)).me.id, a.me.id);
  await assert.rejects(store.members({ ...userA, id: 'different-account' }, emails), { status: 409 });
  const refs = await store.references(); assert.equal(refs.length, 2); assert(!JSON.stringify(refs).includes('resident'));
  const created = await store.create(input({ assigneeId: a.assignees[1].id, related: [{ type: 'recipient', id: 'r1' }, { type: 'worker', id: 'w1' }] }), a);
  assert.equal(created.requesterId, a.me.id); assert.equal(created.version, 1); assert.equal(created.related[1].name, '근로자 A');
  const changed = await store.update(created.id, input({ title: '기초자료 취합', assigneeId: a.assignees[0].id, related: created.related }), created.version, b);
  assert.equal(changed.requesterId, a.me.id); assert.equal(changed.updatedBy, b.me.id); assert.equal(changed.version, 2);
  await assert.rejects(store.update(created.id, input({ title: 'stale' }), 1, a), { status: 409 });
  await assert.rejects(store.create(input({ assigneeId: 'invented-user' }), a), { status: 400 });
  await assert.rejects(store.create(input({ related: [{ type: 'worker', id: 'missing' }] }), a), { status: 400 });
  assert.equal((await store.list(a, a.assignees[0].id, 'open')).length, 1); assert.equal((await store.list(a, a.assignees[1].id, 'open')).length, 0);
  assert.equal((await make().list(a, 'all', 'open'))[0].title, '기초자료 취합');
  db.exec("CREATE TRIGGER reject_work_event BEFORE INSERT ON work_task_events WHEN NEW.kind='updated' BEGIN SELECT RAISE(ABORT,'test-event-failure'); END");
  await assert.rejects(store.update(created.id, input({ title: 'must roll back' }), 2, a));
  assert.equal((await store.list(a, 'all', 'open'))[0].version, 2); assert.equal((await store.list(a, 'all', 'open'))[0].title, '기초자료 취합');
  const cancelled = await store.cancel(created.id, 2, b); assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.version, 3);
  assert.equal((await store.list(a, 'all', 'open')).length, 0); assert.equal((await store.list(a, 'all', 'cancelled')).length, 1);
  await assert.rejects(store.update(created.id, input({ title: 'revive' }), 3, a), { status: 409 });
  assert.deepEqual(db.prepare('SELECT kind FROM work_task_events ORDER BY version').all().map(r => r.kind), ['created', 'updated', 'cancelled']);
  if (mode === 'postgres-adapter') assert(releases > 0);
});

test('Postgres bootstrap includes the portable schema and blocks direct client access', () => {
  const pg = readFileSync(new URL('../server/postgres/schema.sql', import.meta.url), 'utf8');
  assert(pg.includes(readFileSync(new URL('../server/work-task-schema.sql', import.meta.url), 'utf8')));
  for (const name of ['work_members', 'work_assignees', 'work_tasks', 'work_task_events']) {
    assert(pg.includes(`ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY`));
    assert(pg.includes(`REVOKE ALL ON TABLE ${name} FROM anon, authenticated`));
  }
});

test('fixed assignees do not depend on login names, while legacy account assignments survive migration', async t => {
  const db = database(); t.after(() => db.close());
  const oldSchema = readFileSync(new URL('../server/work-task-schema.sql', import.meta.url), 'utf8').replace('  roster_assignee_id TEXT REFERENCES work_assignees(id),\n', '');
  db.exec(oldSchema);
  db.prepare('INSERT INTO work_members(id,email,name,created_at) VALUES(?,?,?,?)').run('legacy-member', userA.email, '이전 표시명', '2026-10-19');
  db.prepare("INSERT INTO work_tasks(id,requester_id,assignee_id,title,description,category,related,status,version,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,'open',1,?,?,?)")
    .run('legacy-task', 'legacy-member', 'legacy-member', '기존 업무', '', 'unclassified', '[]', '2026-10-19', '2026-10-19', 'legacy-member');
  const store = createSqliteWorkStore(db, () => true), current = await store.members({ ...userA, name: '다른 Google 표시명' }, [...emails].reverse());
  assert.deepEqual(current.assignees.map(p => p.name), ['신수연', '박준규', '황영상']);
  const existing = (await store.list(current, 'all', 'open'))[0];
  assert.equal(existing.assigneeId, 'legacy-member'); assert.equal(existing.requesterId, 'legacy-member');
  await assert.rejects(store.create(input({ assigneeId: current.me.id }), current), { status: 400 });
  const retained = await store.update(existing.id, input({ assigneeId: existing.assigneeId }), 1, current);
  assert.equal(retained.assigneeId, 'legacy-member');
  const reassigned = await store.update(existing.id, input({ assigneeId: current.assignees[2].id }), 2, current);
  assert.equal(reassigned.assigneeId, 'staff-hwang-youngsang');
  const raw = db.prepare('SELECT assignee_id,roster_assignee_id FROM work_tasks WHERE id=?').get(existing.id);
  assert.equal(raw.assignee_id, null); assert.equal(raw.roster_assignee_id, 'staff-hwang-youngsang');
});
