import { workError, workCategories, newWorkId } from './work-tasks.mjs';

export function workDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw workError(400, '실제 달력 날짜를 지정해 주세요.');
  return value;
}
export function workPeriod(value) {
  if (!['morning', 'afternoon', 'unknown'].includes(value)) throw workError(400, '오전·오후·미확인 중 시간대를 선택해 주세요.');
  return value;
}
export function workRequestId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw workError(400, '저장 요청 식별자를 확인해 주세요.');
  return value;
}
const snapshot = row => JSON.parse(row.snapshot);
export const planFromRow = row => ({ id: row.id, taskId: row.task_id, assigneeId: row.assignee_id, date: row.work_date, period: row.period,
  snapshot: snapshot(row), status: row.status, version: Number(row.version), createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at });
export const executionFromRow = row => ({ ...planFromRow(row), planId: row.plan_id, content: row.content });
export const lockTask = async (q, id) => (await q(`SELECT * FROM work_tasks WHERE id=$1${q.forUpdate ?? ''}`, [id])).rows[0];
export async function journalEvent(q, type, row, action, actor) {
  await q('INSERT INTO work_journal_events(id,entity_type,entity_id,version,actor_id,action,payload,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [newWorkId(), type, row.id, row.version, actor, action, JSON.stringify(type === 'plan' ? planFromRow(row) : executionFromRow(row)), row.updated_at]);
}
export async function cancelTaskPlans(q, taskId, actor) {
  const rows = (await q("UPDATE work_plans SET status='cancelled',version=version+1,updated_at=$1,updated_by=$2 WHERE task_id=$3 AND status='planned' RETURNING *", [new Date().toISOString(), actor, taskId])).rows;
  for (const row of rows) await journalEvent(q, 'plan', row, 'task_cancelled', actor);
}
const assertVersion = (row, version, status) => {
  if (!row) throw workError(404, '기록을 찾을 수 없습니다.');
  if (!Number.isInteger(version) || row.version !== version || row.status !== status) throw workError(409, '다른 사용자가 기록을 바꾸었습니다. 최신 기록을 불러와 비교해 주세요.');
};
const staffId = (id, current) => {
  if (!current.assignees.some(m => m.id === id)) throw workError(400, '수행할 담당자를 선택해 주세요.');
  return id;
};
const taskSnapshot = row => ({ title: row.title, category: row.category, related: JSON.parse(row.related) });
const content = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 5000) throw workError(400, '실제 수행 내용을 5,000자 이내로 입력해 주세요.');
  return value.trim();
};
const actualDate = date => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (date > today) throw workError(400, '미래 날짜의 실제 수행은 기록할 수 없습니다. 계획으로 남겨주세요.');
};
const taskId = (value, optional = false) => {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw workError(400, '연결할 업무를 확인해 주세요.');
  return value;
};

export function createWorkJournalStore(transaction, resolveRelated) {
  async function readEntity(q, table, id) {
    const initial = (await q(`SELECT * FROM ${table} WHERE id=$1`, [id])).rows[0];
    if (!initial) throw workError(404, '기록을 찾을 수 없습니다.');
    if (initial.task_id) await lockTask(q, initial.task_id);
    return (await q(`SELECT * FROM ${table} WHERE id=$1${q.forUpdate ?? ''}`, [id])).rows[0];
  }
  return {
    calendar(from, to, assignee, current) {
      workDate(from); workDate(to);
      if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 61) throw workError(400, '조회 기간은 순서대로 최대 62일까지 지정해 주세요.');
      if (!['all', 'unassigned'].includes(assignee)) staffId(assignee, current);
      return transaction(async q => {
        const values = [from, to];
        const scope = assignee === 'all' ? '' : assignee === 'unassigned' ? ' AND 1=0' : ' AND assignee_id=$3';
        if (!['all', 'unassigned'].includes(assignee)) values.push(assignee);
        const owner = assignee === 'all' ? '' : assignee === 'unassigned' ? ' AND COALESCE(t.roster_assignee_id,t.assignee_id) IS NULL' : ' AND COALESCE(t.roster_assignee_id,t.assignee_id)=$3';
        const taskSummary = row => ({ id: row.id, title: row.title, category: row.category, dueDate: row.due_date, assigneeId: row.roster_assignee_id ?? row.assignee_id, related: JSON.parse(row.related) });
        return {
          from, to, assignee,
          plans: (await q(`SELECT * FROM work_plans WHERE work_date BETWEEN $1 AND $2 AND status='planned'${scope} ORDER BY work_date,created_at,id`, values)).rows.map(planFromRow),
          executions: (await q(`SELECT * FROM work_executions WHERE work_date BETWEEN $1 AND $2 AND status='recorded'${scope} ORDER BY work_date,created_at,id`, values)).rows.map(executionFromRow),
          deadlines: (await q(`SELECT t.* FROM work_tasks t WHERE t.status='open' AND t.completed_at IS NULL AND t.due_date BETWEEN $1 AND $2${owner} ORDER BY t.due_date,t.created_at,t.id`, values)).rows.map(taskSummary),
          // A plan outside this period still means the task has been scheduled.
          unplanned: (await q(`SELECT t.* FROM work_tasks t WHERE t.status='open' AND t.completed_at IS NULL AND NOT EXISTS (SELECT 1 FROM work_plans p WHERE p.task_id=t.id AND p.status='planned')${owner.replace('$3', '$1')} ORDER BY t.created_at,t.id`, values.slice(2))).rows.map(taskSummary)
        };
      });
    },
    day(date, assignee, current) {
      workDate(date);
      if (assignee !== 'all') staffId(assignee, current);
      return transaction(async q => {
        const values = [date], where = assignee === 'all' ? 'work_date=$1' : 'work_date=$1 AND assignee_id=$2';
        if (assignee !== 'all') values.push(assignee);
        return {
          date, assignee,
          plans: (await q(`SELECT * FROM work_plans WHERE ${where} ORDER BY created_at,id`, values)).rows.map(planFromRow),
          executions: (await q(`SELECT * FROM work_executions WHERE ${where} ORDER BY created_at,id`, values)).rows.map(executionFromRow)
        };
      });
    },
    createPlan(body, current) {
      const id = workRequestId(body?.requestId), date = workDate(body?.date), period = workPeriod(body?.period), assignee = staffId(body?.assigneeId, current);
      const linkedTaskId = taskId(body?.taskId);
      return transaction(async q => {
        const task = await lockTask(q, linkedTaskId);
        if (!task) throw workError(404, '업무를 찾을 수 없습니다.');
        const retry = (await q('SELECT * FROM work_plans WHERE id=$1', [id])).rows[0];
        if (retry) {
          if (retry.task_id === task.id && retry.work_date === date && retry.period === period && retry.assignee_id === assignee && retry.status === 'planned') return planFromRow(retry);
          throw workError(409, '이미 처리된 계획 요청입니다. 최신 기록을 확인해 주세요.');
        }
        if (task.status !== 'open' || task.completed_at) throw workError(409, '취소·완료된 업무는 새 계획에 넣을 수 없습니다.');
        const now = new Date().toISOString();
        const row = (await q(`INSERT INTO work_plans(id,task_id,assignee_id,work_date,period,snapshot,status,version,created_by,updated_by,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,'planned',1,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING *`, [id, task.id, assignee, date, period, JSON.stringify(taskSnapshot(task)), current.me.id, current.me.id, now, now])).rows[0];
        if (!row) throw workError(409, '이 담당자의 같은 날짜에 이미 계획이 있습니다. 기존 계획을 확인해 주세요.');
        await journalEvent(q, 'plan', row, 'created', current.me.id); return planFromRow(row);
      });
    },
    cancelPlan(id, version, current) {
      return transaction(async q => {
        const existing = await readEntity(q, 'work_plans', id); assertVersion(existing, version, 'planned');
        const row = (await q("UPDATE work_plans SET status='cancelled',version=version+1,updated_by=$1,updated_at=$2 WHERE id=$3 AND version=$4 AND status='planned' RETURNING *", [current.me.id, new Date().toISOString(), id, version])).rows[0];
        if (!row) throw workError(409, '계획이 변경되었습니다. 다시 불러와 주세요.');
        await journalEvent(q, 'plan', row, 'cancelled', current.me.id); return planFromRow(row);
      });
    },
    recordPlan(id, body, current) {
      const period = workPeriod(body?.period), requestId = workRequestId(body?.requestId);
      if (period === 'unknown') throw workError(400, '빠른 수행은 오전 또는 오후를 지정해 주세요.');
      return transaction(async q => {
        const plan = await readEntity(q, 'work_plans', id);
        actualDate(plan.work_date);
        if (plan.status !== 'planned') throw workError(409, '취소된 계획입니다. 실제 수행은 별도 기록으로 남겨주세요.');
        const priorRequest = (await q('SELECT * FROM work_executions WHERE id=$1', [requestId])).rows[0];
        if (priorRequest) {
          if (priorRequest.plan_id === id && priorRequest.period === period && priorRequest.status === 'recorded') return executionFromRow(priorRequest);
          throw workError(409, '이미 처리되었거나 취소된 수행 요청입니다. 최신 기록을 확인해 주세요.');
        }
        const existing = (await q("SELECT * FROM work_executions WHERE plan_id=$1 AND status='recorded'", [id])).rows[0];
        if (existing) {
          if (existing.period === period) return executionFromRow(existing);
          assertVersion(existing, body.executionVersion, 'recorded');
          const row = (await q("UPDATE work_executions SET period=$1,version=version+1,updated_by=$2,updated_at=$3 WHERE id=$4 AND version=$5 RETURNING *", [period, current.me.id, new Date().toISOString(), existing.id, existing.version])).rows[0];
          await journalEvent(q, 'execution', row, 'period_changed', current.me.id); return executionFromRow(row);
        }
        if (body.executionVersion !== 0) throw workError(409, '기존 수행이 변경되거나 취소되었습니다. 다시 확인해 주세요.');
        const task = await lockTask(q, plan.task_id);
        if (task.status === 'cancelled') throw workError(409, '취소된 업무입니다.');
        const now = new Date().toISOString();
        const row = (await q(`INSERT INTO work_executions(id,task_id,plan_id,assignee_id,work_date,period,content,snapshot,status,version,created_by,updated_by,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,'recorded',1,$9,$10,$11,$12) RETURNING *`, [requestId, plan.task_id, id, plan.assignee_id, plan.work_date, period, snapshot(plan).title, plan.snapshot, current.me.id, current.me.id, now, now])).rows[0];
        await journalEvent(q, 'execution', row, 'created', current.me.id); return executionFromRow(row);
      });
    },
    recordManual(body, current) {
      const id = workRequestId(body?.requestId), date = workDate(body?.date), period = workPeriod(body?.period), assignee = staffId(body?.assigneeId, current), text = content(body?.content);
      const linkedTaskId = taskId(body?.taskId, true);
      actualDate(date);
      return transaction(async q => {
        let metadata;
        if (linkedTaskId) {
          const task = await lockTask(q, linkedTaskId);
          if (!task) throw workError(404, '업무를 찾을 수 없습니다.');
          if (task.status === 'cancelled') throw workError(409, '취소된 업무입니다.');
          metadata = taskSnapshot(task);
        } else {
          if (!workCategories.includes(body.category)) throw workError(400, '업무 분류를 확인해 주세요.');
          if (!Array.isArray(body.related) || body.related.length > 30 || body.related.some(r => !r || !['recipient','worker'].includes(r.type) || typeof r.id !== 'string')) throw workError(400, '관련자 연결을 확인해 주세요.');
          metadata = { title: text, category: body.category, related: await resolveRelated(q, body.related) };
        }
        const now = new Date().toISOString();
        const row = (await q(`INSERT INTO work_executions(id,task_id,plan_id,assignee_id,work_date,period,content,snapshot,status,version,created_by,updated_by,created_at,updated_at)
          VALUES($1,$2,NULL,$3,$4,$5,$6,$7,'recorded',1,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING RETURNING *`, [id, linkedTaskId, assignee, date, period, text, JSON.stringify(metadata), current.me.id, current.me.id, now, now])).rows[0];
        if (!row) {
          const old = (await q('SELECT * FROM work_executions WHERE id=$1', [id])).rows[0];
          if (old.status === 'recorded' && old.version === 1 && old.created_by === current.me.id && old.task_id === linkedTaskId && !old.plan_id && old.assignee_id === assignee && old.work_date === date && old.period === period && old.content === text && old.snapshot === JSON.stringify(metadata)) return executionFromRow(old);
          throw workError(409, '이 수행 요청은 이미 처리되었습니다. 최신 기록을 확인해 주세요.');
        }
        await journalEvent(q, 'execution', row, 'created', current.me.id); return executionFromRow(row);
      });
    },
    updateExecution(id, body, current) {
      const period = workPeriod(body?.period), text = content(body?.content);
      return transaction(async q => {
        const old = await readEntity(q, 'work_executions', id); assertVersion(old, body.version, 'recorded');
        const assignee = body.assigneeId === undefined ? old.assignee_id : staffId(body.assigneeId, current);
        const row = (await q("UPDATE work_executions SET period=$1,content=$2,assignee_id=$7,version=version+1,updated_by=$3,updated_at=$4 WHERE id=$5 AND version=$6 AND status='recorded' RETURNING *", [period, text, current.me.id, new Date().toISOString(), id, body.version, assignee])).rows[0];
        if (!row) throw workError(409, '수행 기록이 변경되었습니다.');
        await journalEvent(q, 'execution', row, 'updated', current.me.id); return executionFromRow(row);
      });
    },
    cancelExecution(id, version, current) {
      return transaction(async q => {
        const old = await readEntity(q, 'work_executions', id); assertVersion(old, version, 'recorded');
        const row = (await q("UPDATE work_executions SET status='voided',version=version+1,updated_by=$1,updated_at=$2 WHERE id=$3 AND version=$4 AND status='recorded' RETURNING *", [current.me.id, new Date().toISOString(), id, version])).rows[0];
        if (!row) throw workError(409, '수행 기록이 변경되었습니다.');
        await journalEvent(q, 'execution', row, 'voided', current.me.id); return executionFromRow(row);
      });
    }
  };
}
