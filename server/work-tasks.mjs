import { randomUUID } from 'node:crypto';
import { canManageCategories } from './work-recurrence.mjs';

export const workCategories = ['unclassified', 'recipient', 'service', 'staff', 'operations', 'rights'];
export const workError = (status, message) => Object.assign(new Error(message), { status });
export const allowedWorkEmails = (env = process.env) => [...new Set((env.AUTH_ALLOWED_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))];

export function normalizeWorkTask(body, categories = workCategories) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw workError(400, '업무 내용을 확인해 주세요.');
  const text = (key, limit, required = false) => {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw workError(400, `${key === 'title' ? '업무 제목' : '입력 내용'}을 확인해 주세요.`);
    return value.trim();
  };
  const title = text('title', 500, true), description = text('description', 5000), dueDate = text('dueDate', 10);
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < '1000-01-01' || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) throw workError(400, '기한을 실제 달력 날짜로 입력해 주세요.');
  if (!categories.includes(body.category)) throw workError(400, '업무 분류를 확인해 주세요.');
  const assigneeId = text('assigneeId', 100);
  const requestId = text('requestId', 36);
  if (requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw workError(400, '업무 저장 식별자를 확인해 주세요.');
  if (!Array.isArray(body.related) || body.related.length > 30) throw workError(400, '관련자는 30명까지 연결할 수 있습니다.');
  const related = [], seen = new Set();
  for (const item of body.related) {
    if (!item || !['recipient', 'worker'].includes(item.type) || typeof item.id !== 'string' || !item.id || item.id.length > 100) throw workError(400, '관련자 연결을 확인해 주세요.');
    const key = `${item.type}:${item.id}`;
    if (!seen.has(key)) { related.push({ type: item.type, id: item.id }); seen.add(key); }
  }
  return { title, description, assigneeId: assigneeId || null, dueDate: dueDate || null, category: body.category, related, requestId: requestId || null };
}

export async function readWorkBody(request, maxSize = 40000) {
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > maxSize) throw workError(413, '입력 내용이 너무 큽니다.');
    chunks.push(Buffer.from(chunk));
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw workError(400, '입력 형식을 확인해 주세요.');
    return body;
  }
  catch { throw workError(400, '입력 형식을 확인해 주세요.'); }
}

export async function handleWorkTasks(request, response, sendJson, store, user) {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (path !== '/api/work' && !path.startsWith('/api/work/')) return false;
  try {
    if (!user?.id) throw workError(401, '로그인이 필요합니다.');
    const emails = allowedWorkEmails();
    if (!emails.includes(user.email?.toLowerCase())) throw workError(403, '업무 공간 사용 권한이 없습니다.');
    const current = await store.members(user, emails);
    if (path.startsWith('/api/work/records/')) {
      const recordCurrent = await store.staffRecordContext(new URL(request.url, 'http://localhost').searchParams.get('staffId'), current);
      const workspaceRoute = /^\/api\/work\/records\/workspace\/(\d{4}-\d{2})$/.exec(path);
      const monthRoute = /^\/api\/work\/records\/(attendance|journal)\/(\d{4}-\d{2})$/.exec(path);
      const accountRoute = /^\/api\/work\/records\/leave\/(\d{4})(\/account)?$/.exec(path);
      const leaveRoute = /^\/api\/work\/records\/leave-plans(?:\/([^/]+))?$/.exec(path);
      if (path === '/api/work/records/profile' && request.method === 'GET') sendJson(response, 200, await store.recordProfile(recordCurrent));
      else if (path === '/api/work/records/profile' && request.method === 'PUT') sendJson(response, 200, await store.saveRecordProfile(await readWorkBody(request), recordCurrent));
      else if (workspaceRoute && request.method === 'PUT') sendJson(response, 200, await store.saveRecordWorkspace(workspaceRoute[1], await readWorkBody(request, 4000000), recordCurrent));
      else if (monthRoute && request.method === 'GET') sendJson(response, 200, await store.recordMonth(monthRoute[1], monthRoute[2], recordCurrent));
      else if (monthRoute && request.method === 'PUT') sendJson(response, 200, await store.saveRecordMonth(monthRoute[1], monthRoute[2], await readWorkBody(request, 4000000), recordCurrent));
      else if (accountRoute && !accountRoute[2] && request.method === 'GET') sendJson(response, 200, await store.leaveLedger(accountRoute[1], recordCurrent));
      else if (accountRoute?.[2] && request.method === 'PUT') sendJson(response, 200, await store.saveLeaveAccount(accountRoute[1], await readWorkBody(request), recordCurrent));
      else if (leaveRoute && (request.method === 'POST' && !leaveRoute[1] || request.method === 'PUT' && leaveRoute[1])) sendJson(response, 200, await store.saveLeavePlan(leaveRoute[1] ?? null, await readWorkBody(request), recordCurrent));
      else throw workError(404, '근무기록 API를 찾을 수 없습니다.');
      return true;
    }
    const mapCheck = /^\/api\/work\/task-maps\/runs\/([^/]+)\/check$/.exec(path);
    if (path === '/api/work/task-maps' || path === '/api/work/task-maps/start' || mapCheck) {
      if (path === '/api/work/task-maps' && request.method === 'GET') sendJson(response, 200, await store.taskMaps(new URL(request.url, 'http://localhost').searchParams.get('month') ?? undefined));
      else if (request.method === 'POST') {
        const body = await readWorkBody(request, 120000);
        sendJson(response, 200, mapCheck ? await store.checkTaskMap(mapCheck[1], body, current) : path.endsWith('/start') ? await store.startTaskMap(body, current) : await store.saveTaskMap(body, current));
      } else throw workError(405, '지원하지 않는 요청입니다.');
      return true;
    }
    const categoryRoute = /^\/api\/work\/categories(?:\/([^/]+))?$/.exec(path);
    const recurrenceRoute = /^\/api\/work\/recurrences(?:\/([^/]+))?$/.exec(path);
    if ((path === '/api/work/context' || path === '/api/work/tasks') && request.method === 'GET') await store.ensureRecurring();
    if (categoryRoute) {
      if (request.method === 'GET' && !categoryRoute[1]) sendJson(response, 200, { categories: await store.categories(), canManage: canManageCategories(current) });
      else if (request.method === 'POST' && !categoryRoute[1] || ['PUT','DELETE'].includes(request.method) && categoryRoute[1]) sendJson(response, 200, await store.categoryChange(categoryRoute[1] ?? null, await readWorkBody(request), current, request.method === 'DELETE'));
      else throw workError(405, '지원하지 않는 요청입니다.');
      return true;
    }
    if (recurrenceRoute) {
      if (request.method === 'GET' && !recurrenceRoute[1]) sendJson(response, 200, { rules: await store.recurrenceRules(current), leaveLinkedAssignees: await store.leaveLinkedAssignees(), month: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()) });
      else if (request.method === 'POST' && !recurrenceRoute[1] || request.method === 'PUT' && recurrenceRoute[1]) sendJson(response, 200, await store.saveRecurrence(recurrenceRoute[1] ?? null, await readWorkBody(request), current));
      else throw workError(405, '지원하지 않는 요청입니다.');
      return true;
    }
    const planRoute = /^\/api\/work\/plans\/([^/]+)\/(cancel|execute)$/.exec(path);
    const executionRoute = /^\/api\/work\/executions\/([^/]+)(\/cancel)?$/.exec(path);
    if (path === '/api/work/calendar' && request.method === 'GET') {
      const query = new URL(request.url, 'http://localhost').searchParams;
      sendJson(response, 200, await store.calendar(query.get('from'), query.get('to'), query.get('assignee') ?? 'all', current));
    } else if (path === '/api/work/day' && request.method === 'GET') {
      const query = new URL(request.url, 'http://localhost').searchParams;
      sendJson(response, 200, await store.day(query.get('date'), query.get('assignee') ?? 'all', current));
    } else if (path === '/api/work/plans' && request.method === 'POST') sendJson(response, 201, await store.createPlan(await readWorkBody(request), current));
    else if (planRoute && request.method === 'POST') {
      const body = await readWorkBody(request), id = decodeURIComponent(planRoute[1]);
      sendJson(response, 200, planRoute[2] === 'cancel' ? await store.cancelPlan(id, body.version, current) : await store.recordPlan(id, body, current));
    } else if (path === '/api/work/executions' && request.method === 'POST') sendJson(response, 201, await store.recordManual(await readWorkBody(request), current));
    else if (executionRoute && (request.method === 'PUT' && !executionRoute[2] || request.method === 'POST' && executionRoute[2])) {
      const body = await readWorkBody(request), id = decodeURIComponent(executionRoute[1]);
      sendJson(response, 200, executionRoute[2] ? await store.cancelExecution(id, body.version, current) : await store.updateExecution(id, body, current));
    } else if (path === '/api/work/context' && request.method === 'GET') {
      const categories = await store.categories();
      sendJson(response, 200, { ...current, categories: categories.filter(row => row.active).map(row => row.id), categoryLabels: Object.fromEntries(categories.map(row => [row.id, row.name])), canManageCategories: canManageCategories(current), references: await store.references() });
    }
    else if (path === '/api/work/tasks' && request.method === 'GET') {
      const query = new URL(request.url, 'http://localhost').searchParams;
      sendJson(response, 200, await store.list(current, query.get('assignee') ?? 'all', query.get('status') ?? 'open'));
    } else if (path === '/api/work/tasks' && request.method === 'POST') sendJson(response, 201, await store.create(normalizeWorkTask(await readWorkBody(request), (await store.categories()).map(row => row.id)), current));
    else {
      const match = /^\/api\/work\/tasks\/([^/]+)(\/cancel|\/history|\/complete|\/reopen)?$/.exec(path);
      if (!match) throw workError(404, '업무 API를 찾을 수 없습니다.');
      const id = decodeURIComponent(match[1]);
      if (request.method === 'GET' && match[2] === '/history') sendJson(response, 200, await store.history(id));
      else if (request.method === 'PUT' && !match[2]) {
        const body = await readWorkBody(request);
        sendJson(response, 200, await store.update(id, normalizeWorkTask(body, (await store.categories()).map(row => row.id)), body.version, current));
      } else if (request.method === 'POST' && match[2] === '/cancel') {
        const body = await readWorkBody(request);
        sendJson(response, 200, await store.cancel(id, body.version, current));
      } else if (request.method === 'POST' && ['/complete', '/reopen'].includes(match[2])) {
        const body = await readWorkBody(request);
        sendJson(response, 200, await store.complete(id, body.version, current, match[2] === '/reopen'));
      } else throw workError(405, '지원하지 않는 요청입니다.');
    }
  } catch (error) {
    const status = [400, 401, 403, 404, 405, 409, 413].includes(error.status) ? error.status : 500;
    sendJson(response, status, { error: status === 500 ? '업무를 저장하거나 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' : error.message });
  }
  return true;
}

export const newWorkId = () => randomUUID();
