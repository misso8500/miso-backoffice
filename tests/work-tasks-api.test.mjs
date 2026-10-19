import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

test('work HTTP flow: verified accounts, directory drafts, shared edits, retries, conflicts and durable cancellation', { timeout: 25000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'miso-work-hub-')), dbPath = join(dir, 'test.sqlite');
  const auth = createServer((req, res) => {
    const who = /^Bearer (a|b|c|outsider)$/.exec(req.headers.authorization ?? '')?.[1];
    res.writeHead(who ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: `google-${who}`, email: `${who}@example.com`, email_confirmed_at: '2026-01-01', app_metadata: { provider: 'google' }, identities: [{ provider: 'google' }], user_metadata: { full_name: `직원 ${who}` } }));
  });
  await new Promise(resolve => auth.listen(0, '127.0.0.1', resolve));
  const reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  let child;
  const stop = async () => { if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); } };
  t.after(async () => { await stop(); await new Promise(resolve => auth.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const start = async () => {
    child = spawn(process.execPath, ['server/api.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), MISO_BACKOFFICE_DB_PATH: dbPath,
      SUPABASE_URL: `http://127.0.0.1:${auth.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', AUTH_ALLOWED_EMAILS: 'a@example.com,b@example.com,c@example.com' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Startup timed out: ${stderr}`)), 10000);
      child.stdout.on('data', chunk => { if (chunk.toString().includes('API running')) { clearTimeout(timer); resolve(); } });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`API exited ${code}: ${stderr}`)); });
    });
  };
  await start();
  const call = async (path, method = 'GET', body, token = 'a') => {
    const response = await fetch(`http://127.0.0.1:${port}/api/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await call('work/tasks', 'GET', undefined, '')).status, 401);
  assert.equal((await call('work/context', 'GET', undefined, 'outsider')).status, 403);
  const a = (await call('work/context')).data, b = (await call('work/context', 'GET', undefined, 'b')).data;
  assert.equal(a.members.length, 3); assert.deepEqual(a.assignees.map(p => p.name), ['신수연', '박준규', '황영상']); assert.equal(b.me.name, '직원 b');
  const rId = randomUUID(), wId = randomUUID();
  assert.equal((await call('recipients/bulk-drafts', 'POST', { rows: [{ id: rId, name: '업무 관련 신규 수급자', phone: '010-0000-0000' }] })).status, 200);
  assert.equal((await call('employment-contracts/bulk-drafts', 'POST', { rows: [{ id: wId, workerName: '업무 관련 신규 근로자' }] })).status, 200);
  const references = (await call('work/context')).data.references;
  assert(references.some(r => r.type === 'recipient' && r.id === rId)); assert(references.some(r => r.type === 'worker' && r.id === wId));
  assert(!JSON.stringify(references).includes('residentRegistrationNumber')); assert(!JSON.stringify(references).includes('010-0000-0000'));
  const body = { requestId: randomUUID(), title: '신규 수급자 파일 작성', description: '기초서류 취합', category: 'recipient', dueDate: '2026-10-20', assigneeId: a.assignees[1].id,
    related: [{ type: 'recipient', id: rId }, { type: 'worker', id: wId }], requesterId: b.me.id, updatedBy: b.me.id };
  const created = await call('work/tasks', 'POST', body); assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.id;
  assert.equal(created.data.requesterId, a.me.id); assert.equal(created.data.updatedBy, a.me.id);
  const retry = await call('work/tasks', 'POST', body); assert.equal(retry.status, 201); assert.equal(retry.data.id, id);
  assert.equal((await call('work/tasks')).data.length, 1);
  assert.equal((await call(`work/tasks?assignee=${a.assignees[1].id}`)).data.length, 1);
  assert.equal((await call('work/tasks?assignee=unassigned')).data.length, 0);
  assert.equal((await call('work/tasks?status=invalid')).status, 400);
  assert.equal((await call('work/tasks', 'POST', { ...body, requestId: randomUUID(), dueDate: '2026-02-30' })).status, 400);
  const edits = await Promise.all([
    call(`work/tasks/${id}`, 'PUT', { ...body, title: '서류 취합 중', version: 1 }, 'b'),
    call(`work/tasks/${id}`, 'PUT', { ...body, title: '서류 확인 중', version: 1 }, 'c')
  ]);
  assert.deepEqual(edits.map(r => r.status).sort(), [200, 409]);
  const edited = edits.find(r => r.status === 200).data; assert.equal(edited.version, 2); assert.notEqual(edited.updatedBy, a.me.id);
  assert.equal((await call('work/tasks', 'POST', body)).status, 409);
  assert.equal((await call(`work/tasks/${id}/cancel`, 'POST', { version: 1 }, 'c')).status, 409);
  const cancelled = await call(`work/tasks/${id}/cancel`, 'POST', { version: 2 }, 'c'); assert.equal(cancelled.status, 200); assert.equal(cancelled.data.status, 'cancelled');
  assert.equal((await call('work/tasks')).data.length, 0);
  await stop(); await start();
  const restored = await call('work/tasks?status=cancelled'); assert.equal(restored.data.length, 1); assert.equal(restored.data[0].version, 3);
  assert.equal(restored.data[0].canEdit, false);
  const history = await call(`work/tasks/${id}/history`);
  assert.equal(history.status, 200); assert.deepEqual(history.data.map(e => e.kind), ['cancelled', 'updated', 'created']);
  assert.equal(history.data.at(-1).actorName, '직원 a'); assert.equal(history.data.at(-1).task.title, body.title);
  assert.equal((await call(`work/tasks/${id}/history`, 'GET', undefined, '')).status, 401);
  assert.equal((await call('work/tasks/not-found/history')).status, 404);
  const db = new DatabaseSync(dbPath);
  try {
    const events = db.prepare('SELECT kind,actor_id,payload FROM work_task_events WHERE task_id=? ORDER BY version').all(id);
    assert.deepEqual(events.map(e => e.kind), ['created', 'updated', 'cancelled']);
    assert.equal(events[0].actor_id, a.me.id); assert.equal(JSON.parse(events[0].payload).title, body.title);
  } finally { db.close(); }

  await t.test('daily journal routes persist plans/executions, deduplicate quick actions and keep completion separate', async () => {
    assert.equal((await call('work/day?date=2000-10-19', 'GET', undefined, '')).status, 401);
    assert.equal((await call('work/day?date=2026-02-30')).status, 400);
    const task = (await call('work/tasks', 'POST', { ...body, requestId: randomUUID(), title: '일간 업무' })).data;
    const assigneeId = a.assignees[1].id, day = '2000-10-19';
    const planBody = { requestId: randomUUID(), taskId: task.id, date: day, assigneeId, period: 'morning', snapshot: { title: '위조 제목' }, createdBy: 'fake-actor' };
    const plan = await call('work/plans', 'POST', planBody, 'b'); assert.equal(plan.status, 201, JSON.stringify(plan.data));
    assert.equal(plan.data.snapshot.title, task.title); assert.equal(plan.data.createdBy, b.me.id);
    assert.equal((await call('work/plans', 'POST', planBody, 'b')).data.id, plan.data.id);
    assert.equal((await call('work/plans', 'POST', { ...planBody, requestId: randomUUID() })).status, 409);
    const executed = await Promise.all(['b','c'].map(token => call(`work/plans/${plan.data.id}/execute`, 'POST', { requestId: randomUUID(), period: 'morning', executionVersion: 0 }, token)));
    assert(executed.every(r => r.status === 200)); assert.equal(executed[0].data.id, executed[1].data.id);
    let execution = executed[0].data;
    assert.equal((await call(`work/day?date=${day}&assignee=${assigneeId}`)).data.executions.filter(e => e.status === 'recorded').length, 1);
    assert.equal((await call(`work/day?date=${day}&assignee=${a.assignees[0].id}`)).data.executions.length, 0);
    assert.equal((await call('work/tasks?status=open')).data.find(t => t.id === task.id).status, 'open');
    const edit = await call(`work/executions/${execution.id}`, 'PUT', { version: execution.version, content: '실제 수행 결과', period: 'afternoon' }, 'c'); assert.equal(edit.status, 200); execution = edit.data;
    assert.equal((await call(`work/executions/${execution.id}`, 'PUT', { version: 1, content: '오래된 수정', period: 'morning' })).status, 409);
    const manual = await call('work/executions', 'POST', { requestId: randomUUID(), date: day, assigneeId: a.assignees[2].id, period: 'unknown', content: '돌발 연락 대응', category: 'service', related: [{ type: 'recipient', id: rId }] }); assert.equal(manual.status, 201);
    assert.equal(manual.data.taskId, null); assert.equal(manual.data.planId, null);
    assert.equal((await call(`work/plans/${plan.data.id}/cancel`, 'POST', { version: plan.data.version }, 'c')).status, 200);
    assert.equal((await call(`work/day?date=${day}`)).data.executions.find(e => e.id === execution.id).status, 'recorded');
    const done = await call(`work/tasks/${task.id}/complete`, 'POST', { version: task.version }); assert.equal(done.status, 200); assert.equal(done.data.status, 'done');
    assert((await call('work/tasks?status=done')).data.some(t => t.id === task.id));
    assert.equal((await call('work/plans', 'POST', { ...planBody, requestId: randomUUID() })).status, 409);
    const reopened = await call(`work/tasks/${task.id}/reopen`, 'POST', { version: done.data.version }); assert.equal(reopened.status, 200);
    const active = await call('work/plans', 'POST', { ...planBody, requestId: randomUUID(), period: 'afternoon' }); assert.equal(active.status, 201);
    assert.equal((await call(`work/tasks/${task.id}/cancel`, 'POST', { version: reopened.data.version })).status, 200);
    assert.equal((await call(`work/day?date=${day}`)).data.plans.find(p => p.id === active.data.id).status, 'cancelled');
    assert.equal((await call(`work/executions/${execution.id}/cancel`, 'POST', { version: execution.version }, 'b')).status, 200);
    await stop(); await start();
    const persisted = (await call(`work/day?date=${day}`)).data;
    assert.equal(persisted.executions.find(e => e.id === execution.id).status, 'voided');
    assert.equal(persisted.executions.find(e => e.id === manual.data.id).content, '돌발 연락 대응');
    assert(persisted.plans.every(p => p.status === 'cancelled'));
  });
});
