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
      SUPABASE_URL: `http://127.0.0.1:${auth.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', AUTH_ALLOWED_EMAILS: 'a@example.com,b@example.com,c@example.com', WORK_CATEGORY_ADMIN_EMAILS: 'a@example.com' }, stdio: ['ignore', 'pipe', 'pipe'] });
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

  await t.test('batch detail edits link newly registered people and survive a server restart', async () => {
    const task = (await call('work/tasks', 'POST', { ...body, requestId: randomUUID(), title: '상세 수정 전', related: [] })).data;
    const recipientId = randomUUID(), workerId = randomUUID();
    assert.equal((await call('recipients/bulk-drafts', 'POST', { rows: [{ id: recipientId, name: '상세에서 추가한 수급자' }] })).status, 200);
    assert.equal((await call('employment-contracts/bulk-drafts', 'POST', { rows: [{ id: workerId, workerName: '상세에서 추가한 근로자' }] })).status, 200);
    const changed = { ...body, title: '여러 항목을 함께 수정', description: '새 연결 대상에게 전달', category: 'service', dueDate: '2026-11-02', assigneeId: a.assignees[2].id, related: [{ id: recipientId, type: 'recipient' }, { id: workerId, type: 'worker' }], version: task.version };
    const saved = await call(`work/tasks/${task.id}`, 'PUT', changed);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.version, task.version + 1);
    assert.deepEqual(saved.data.related.map(r => r.name), ['상세에서 추가한 수급자', '상세에서 추가한 근로자']);
    assert.equal((await call(`work/tasks/${task.id}`, 'PUT', { ...changed, title: '오래된 저장' })).status, 409);
    await stop(); await start();
    const restored = (await call('work/tasks?status=all')).data.find(row => row.id === task.id);
    for (const key of ['title', 'description', 'category', 'dueDate', 'assigneeId']) assert.equal(restored[key], changed[key]);
    assert.deepEqual(restored.related.map(r => r.id), [recipientId, workerId]);
  });

  await t.test('recurrence HTTP routes enforce developer permissions and private rules', async () => {
    assert.equal((await call('work/categories', 'POST', { name: '금지' }, 'b')).status, 403);
    const category = await call('work/categories', 'POST', { name: '반복 관리' }); assert.equal(category.status, 200);
    const currentContext = (await call('work/context')).data;
    assert.equal(currentContext.categoryLabels[category.data.id], '반복 관리'); assert.equal(currentContext.canManageCategories, true);
    const input = { requestId: randomUUID(), title: '월간 테스트', description: '', assigneeId: a.assignees[0].id, category: category.data.id, kind: 'monthly', dueDay: 31, includeSaturday: false, includeSunday: false, includeLeave: true, active: true, month: '2099-12' };
    const created = await call('work/recurrences', 'POST', input); assert.equal(created.status, 200, JSON.stringify(created.data)); assert.equal(created.data.created, 1);
    assert.equal((await call('work/recurrences', 'POST', input)).data.created, 0);
    assert.equal((await call(`work/recurrences/${created.data.rule.id}`, 'PUT', { ...created.data.rule, title: '다른 사람의 수정' }, 'b')).status, 404);
    assert.equal((await call('work/recurrences', 'GET', undefined, 'b')).data.rules.length, 0);
    const month = (await call('work/recurrences')).data.month;
    const tasks = (await call('work/tasks?status=all')).data.filter(row => row.title === input.title);
    assert.equal(tasks.length, 1); assert.equal(tasks[0].dueDate.slice(0, 7), month); assert.notEqual(month, input.month);
    const manual = await call('work/tasks', 'POST', { ...body, requestId: randomUUID(), category: category.data.id }); assert.equal(manual.status, 201);
    const paused = await call(`work/recurrences/${created.data.rule.id}`, 'PUT', { ...created.data.rule, active: false }); assert.equal(paused.status, 200);
    assert.equal((await call('work/categories/'+category.data.id, 'DELETE', { version: category.data.version }, 'b')).status, 403);
    assert.equal((await call('work/categories/'+category.data.id, 'DELETE', { version: category.data.version })).status, 200);
    assert.equal((await call('work/tasks', 'POST', { ...body, requestId: randomUUID(), category: category.data.id })).status, 400);
    assert.equal((await call('work/recurrences', 'POST', { ...input, requestId: randomUUID(), kind: 'daily', includeLeave: false, category: 'unclassified' })).status, 400);
  });

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
    const range = `work/calendar?from=${day}&to=2000-10-25`;
    assert.equal((await call(range, 'GET', undefined, '')).status,401);
    assert.equal((await call(range, 'GET', undefined, 'outsider')).status,403);
    const calendar = await call(range); assert.equal(calendar.status,200);
    assert.equal(calendar.data.plans.length,1); assert.equal(calendar.data.executions.length,2);
    assert.equal((await call(`${range}&assignee=${a.assignees[2].id}`)).data.executions[0].id,manual.data.id);
    assert.equal((await call(`${range}&assignee=unassigned`)).data.executions.length,0);
    assert.equal((await call('work/calendar?from=2000-01-01&to=2001-01-01')).status,400);
    assert.equal((await call('work/calendar?from=2000-02-30&to=2000-03-01')).status,400);
    assert.equal((await call(`${range}&assignee=not-staff`)).status,400);
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
    const restoredCalendar = (await call(range)).data;
    assert.equal(restoredCalendar.plans.length,0); assert.equal(restoredCalendar.executions.length,1);
    assert.equal(restoredCalendar.executions[0].id,manual.data.id);
  });
  await t.test('staff record HTTP endpoints share a selected employee across accounts and isolate other employees', async () => {
    const first=a.assignees[0].id,second=a.assignees[1].id;
    const record=(path,method='GET',body,token='a',staffId=first)=>call(path+'?staffId='+encodeURIComponent(staffId),method,body,token);
    assert.equal((await call('work/records/profile','GET',undefined,'')).status,401);
    assert.equal((await call('work/records/profile')).status,400);
    assert.equal((await record('work/records/profile','GET',undefined,'a','invented')).status,400);
    const profile={staffId:first,name:'직원 A',organization:'기존 기관',jobTitle:'사회복지사',startTime:'09:00',endTime:'18:00',hours:8,version:0};
    assert.equal((await record('work/records/profile','PUT',profile)).status,200);
    assert.equal((await record('work/records/profile','GET',undefined,'b')).data.name,'직원 A');
    assert.equal((await record('work/records/profile','PUT',profile,'b')).status,409);
    assert.equal((await record('work/records/profile','PUT',{...profile,staffId:second,name:'직원 B'},'a',second)).status,200);
    const draft=(await record('work/records/attendance/2000-10')).data;
    draft.document.payload.rows.forEach(row=>{row.kind='off';row.reviewed=true;});
    Object.assign(draft.document.payload.rows[0],{kind:'work',start:'09:00',end:'18:00',hours:8});
    const body={action:'confirm',version:0,payload:draft.document.payload,sourceHash:draft.sourceHash};
    const confirmed=await record('work/records/attendance/2000-10','PUT',body);assert.equal(confirmed.status,200,JSON.stringify(confirmed.data));
    assert.equal((await record('work/records/attendance/2000-10','GET',undefined,'b')).data.document.version,1);
    assert.equal((await record('work/records/attendance/2000-10','GET',undefined,'a',second)).data.document.version,0);
    assert.equal((await record('work/records/attendance/2000-10','PUT',body,'b')).status,409);
    assert.equal((await record('work/records/profile','PUT',{...profile,organization:'새 기관',version:1},'b')).status,200);
    assert.equal((await record('work/records/attendance/2000-10')).data.document.payload.profile.organization,'기존 기관');
    assert.equal((await record('work/records/attendance/2000-10','PUT',{action:'reopen',version:1,reason:''})).status,400);
    assert.equal((await record('work/records/attendance/2000-10','PUT',{action:'reopen',version:1,reason:'근무 시간 정정'},'b')).status,200);
    assert.equal((await record('work/records/profile','PUT',{...profile,staffId:second,version:2})).status,400);
    const budget=await record('work/records/leave/2026/account','PUT',{version:0,granted:15,openingUsed:1});assert.equal(budget.status,200);
    assert.equal((await record('work/records/leave/2026','GET',undefined,'b')).data.totals.granted,15);
    const plan=await record('work/records/leave-plans','POST',{dates:[{date:'2026-09-10',days:1}],leaveReason:'개인사유',contact:'',substitute:'직원 B',applicationDate:'2026-09-01',status:'confirmed',version:0});assert.equal(plan.status,200,JSON.stringify(plan.data));
    assert.equal((await record('work/records/leave-plans/'+plan.data.id,'PUT',{...plan.data,status:'draft',reason:'다른 직원 수정'},'b',second)).status,404);
    assert.equal((await record('work/records/leave-plans/'+plan.data.id,'PUT',{...plan.data,status:'draft',reason:'대리 수정'},'b')).status,200);
    assert.equal((await record('work/records/leave/2026','GET',undefined,'a',second)).data.plans.length,0);
  });
});
