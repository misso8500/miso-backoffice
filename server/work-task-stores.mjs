import {createServicePauseStore, heldTaskSql, assertVisitAvailable} from './service-pauses.mjs';
import { createVisitStore } from './work-visits.mjs';
import { readFileSync } from 'node:fs';
import { newWorkId, workError } from './work-tasks.mjs';
import { fixedWorkAssignees } from '../shared/work-assignees.mjs';
import { createWorkJournalStore, lockTask, cancelTaskPlans } from './work-journal.mjs';
import { createRecurrenceStore, validateWorkCategory } from './work-recurrence.mjs';
import { createStaffRecordStore } from './staff-records.mjs';

const member = row => ({ id: row.id, name: row.name, email: row.email, linked: Boolean(row.auth_id) });
const task = row => ({ id: row.id, requesterId: row.requester_id, assigneeId: row.roster_assignee_id ?? row.assignee_id,
  title: row.title, description: row.description, category: row.category, dueDate: row.due_date,
  onHold: Boolean(row.visit_on_hold), related: JSON.parse(row.related), status: row.status === 'open' && row.completed_at ? 'done' : row.status, completedAt: row.completed_at ?? null, version: Number(row.version),
  createdAt: row.created_at, updatedAt: row.updated_at, updatedBy: row.updated_by });

function createWorkStore(transaction, canEdit) {
  const refs = async q => {
    const recipients = (await q('SELECT id,name,operational_name,is_draft FROM recipients WHERE enabled = TRUE ORDER BY name', [])).rows;
    const workers = (await q('SELECT id,worker_name,contract_start_date,contract_end_date,is_draft FROM employment_contracts WHERE enabled = TRUE ORDER BY worker_name,contract_start_date DESC', [])).rows;
    return [
      ...recipients.map(r => ({ id: r.id, type: 'recipient', name: r.name, info: r.operational_name || '', isDraft: Boolean(r.is_draft) })),
      ...workers.map(r => ({ id: r.id, type: 'worker', name: r.worker_name, info: `${r.contract_start_date || '기간 미입력'} ~ ${r.contract_end_date || '종료일 미입력'}`, isDraft: Boolean(r.is_draft) }))
    ];
  };
  const related = async (q, input, previous = []) => {
    const available = await refs(q), result = [];
    for (const link of input) {
      // Existing disabled references remain readable, but cannot be newly attached.
      const reference = available.find(r => r.id === link.id && r.type === link.type) ?? previous.find(r => r.id === link.id && r.type === link.type);
      if (!reference) throw workError(400, '연결할 수급자 또는 근로계약을 찾을 수 없습니다. 명부를 다시 불러와 주세요.');
      result.push({ id: reference.id, type: reference.type, name: reference.name, info: reference.info });
    }
    return result;
  };
  const authorizeVersion = (row, version, current) => {
    if (!row) throw workError(404, '업무를 찾을 수 없습니다.');
    if (!canEdit(task(row), current.me.id)) throw workError(403, '이 업무를 수정하거나 취소할 권한이 없습니다.');
    if (!Number.isInteger(version) || version !== Number(row.version)) throw workError(409, '다른 사용자가 업무를 변경했습니다. 입력을 보존한 채 최신 목록을 불러와 주세요.');
    if (row.status === 'cancelled') throw workError(409, '이미 취소된 업무입니다. 최신 목록을 확인해 주세요.');
  };
  const validateAssignee = (input, current, previousId = null) => {
    if (input.assigneeId && input.assigneeId !== previousId && !current.assignees.some(m => m.id === input.assigneeId)) throw workError(400, '지정된 세 명의 담당자 중에서 선택해 주세요.');
  };
  const event = async (q, row, kind, actor) => {
    await q('INSERT INTO work_task_events(id,task_id,version,actor_id,kind,payload,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [newWorkId(), row.id, row.version, actor, kind, JSON.stringify(task(row)), row.updated_at]);
  };
  return {
    ...createServicePauseStore(transaction,event),
    ...createVisitStore(transaction, task, event),
    ...createStaffRecordStore(transaction),
    ...createRecurrenceStore(transaction),
    ...createWorkJournalStore(transaction, related),
    members(user, emails) {
      return transaction(async q => {
        const now = new Date().toISOString();
        for (const assignee of fixedWorkAssignees) await q('INSERT INTO work_assignees(id,name,sort_order) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order RETURNING id', [assignee.id, assignee.name, assignee.order]);
        for (const email of emails) await q('INSERT INTO work_members(id,email,name,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING id', [newWorkId(), email, email, now]);
        const me = (await q('UPDATE work_members SET auth_id=$1,name=$2 WHERE email=$3 AND (auth_id IS NULL OR auth_id=$4) RETURNING *', [user.id, user.name, user.email.toLowerCase(), user.id])).rows[0];
        if (!me) throw workError(409, '구성원 계정 연결을 확인해 주세요.');
        const members = (await q('SELECT * FROM work_members ORDER BY name,id', [])).rows.filter(r => emails.includes(r.email)).map(member);
        return { me: member(me), members, assignees: fixedWorkAssignees.map(({ id, name }) => ({ id, name })) };
      });
    },
    references() { return transaction(q => refs(q)); },
    history(id) {
      return transaction(async q => {
        if (!(await q('SELECT id FROM work_tasks WHERE id=$1', [id])).rows.length) throw workError(404, '업무를 찾을 수 없습니다.');
        const rows = (await q('SELECT e.*,m.name AS actor_name FROM work_task_events e JOIN work_members m ON m.id=e.actor_id WHERE e.task_id=$1 ORDER BY e.version DESC', [id])).rows;
        return rows.map(row => ({ version: Number(row.version), kind: row.kind, actorName: row.actor_name, createdAt: row.created_at, task: JSON.parse(row.payload) }));
      });
    },
    async list(current, assignee, status) {
      if (assignee !== 'all' && assignee !== 'unassigned' && ![...current.members, ...current.assignees].some(m => m.id === assignee)) throw workError(400, '담당자 필터를 확인해 주세요.');
      if (!['open', 'done', 'cancelled', 'all'].includes(status)) throw workError(400, '업무 상태를 확인해 주세요.');
      return transaction(async q => {
        const conditions = [], values = [];
        if (assignee === 'unassigned') conditions.push('COALESCE(roster_assignee_id,assignee_id) IS NULL');
        else if (assignee !== 'all') { values.push(assignee); conditions.push(`COALESCE(roster_assignee_id,assignee_id)=$${values.length}`); }
        if (status !== 'all') { values.push(status === 'done' ? 'open' : status); conditions.push(`status=$${values.length}`); }
        if (status === 'open') conditions.push('completed_at IS NULL');
        if (status === 'done') conditions.push('completed_at IS NOT NULL');
        const rows = (await q(`SELECT *,${heldTaskSql} AS visit_on_hold FROM work_tasks${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''} ORDER BY created_at DESC,id DESC`, values)).rows;
        return rows.map(row => ({ ...task(row), canEdit: row.status !== 'cancelled' && canEdit(task(row), current.me.id) }));
      });
    },
    async create(input, current) {
      validateAssignee(input, current);
      return transaction(async q => {
        await validateWorkCategory(q, input.category);
        const links = await related(q, input.related), now = new Date().toISOString();
        const id = input.requestId || newWorkId();
        const row = (await q(`INSERT INTO work_tasks(id,requester_id,roster_assignee_id,title,description,category,due_date,related,status,version,created_at,updated_at,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,'open',1,$9,$10,$11) ON CONFLICT(id) DO NOTHING RETURNING *`,
        [id, current.me.id, input.assigneeId, input.title, input.description, input.category, input.dueDate, JSON.stringify(links), now, now, current.me.id])).rows[0];
        if (!row) {
          const existing = (await q('SELECT * FROM work_tasks WHERE id=$1', [id])).rows[0];
          const sameLinks = JSON.stringify(JSON.parse(existing.related).map(({ id, type }) => ({ type, id }))) === JSON.stringify(input.related);
          if (existing.requester_id !== current.me.id || existing.version !== 1 || existing.title !== input.title || existing.description !== input.description || task(existing).assigneeId !== input.assigneeId || existing.category !== input.category || existing.due_date !== input.dueDate || !sameLinks) throw workError(409, '이 등록 요청은 이미 처리되었습니다. 최신 목록에서 확인해 주세요.');
          return { ...task(existing), canEdit: canEdit(task(existing), current.me.id) };
        }
        await event(q, row, 'created', current.me.id);
        return { ...task(row), canEdit: canEdit(task(row), current.me.id) };
      });
    },
    async update(id, input, version, current) {
      return transaction(async q => {
        const previous = await lockTask(q, id);
        authorizeVersion(previous, version, current);
        await assertVisitAvailable(q,id);
        await validateWorkCategory(q, input.category, previous.category);
        validateAssignee(input, current, task(previous).assigneeId);
        const isRoster = current.assignees.some(m => m.id === input.assigneeId);
        const links = await related(q, input.related, JSON.parse(previous.related));
        const row = (await q(`UPDATE work_tasks SET assignee_id=$1,title=$2,description=$3,category=$4,due_date=$5,related=$6,version=version+1,updated_at=$7,updated_by=$8,roster_assignee_id=$11
          WHERE id=$9 AND version=$10 AND status='open' RETURNING *`, [isRoster ? null : input.assigneeId, input.title, input.description, input.category, input.dueDate, JSON.stringify(links), new Date().toISOString(), current.me.id, id, version, isRoster ? input.assigneeId : null])).rows[0];
        if (!row) throw workError(409, '다른 사용자가 업무를 변경했습니다. 최신 목록을 불러와 주세요.');
        await event(q, row, 'updated', current.me.id);
        return { ...task(row), canEdit: canEdit(task(row), current.me.id) };
      });
    },
    cancel(id, version, current) {
      return transaction(async q => {
        const previous = await lockTask(q, id);
        authorizeVersion(previous, version, current);
        const row = (await q(`UPDATE work_tasks SET status='cancelled',version=version+1,updated_at=$1,updated_by=$2 WHERE id=$3 AND version=$4 AND status='open' RETURNING *`, [new Date().toISOString(), current.me.id, id, version])).rows[0];
        if (!row) throw workError(409, '다른 사용자가 업무를 변경했습니다. 최신 목록을 불러와 주세요.');
        await cancelTaskPlans(q, id, current.me.id);
        await event(q, row, 'cancelled', current.me.id);
        return { ...task(row), canEdit: false };
      });
    },
    complete(id, version, current, reopen = false) {
      return transaction(async q => {
        const previous = await lockTask(q, id);
        authorizeVersion(previous, version, current);
        await assertVisitAvailable(q,id);
        if (Boolean(previous.completed_at) === !reopen) throw workError(409, '업무 완료 상태가 이미 변경되었습니다. 다시 확인해 주세요.');
        const now = new Date().toISOString();
        const row = (await q("UPDATE work_tasks SET completed_at=$1,version=version+1,updated_by=$2,updated_at=$3 WHERE id=$4 AND version=$5 AND status='open' RETURNING *", [reopen ? null : now, current.me.id, now, id, version])).rows[0];
        if (!row) throw workError(409, '다른 사용자가 업무를 변경했습니다.');
        await event(q, row, 'updated', current.me.id);
        return { ...task(row), canEdit: canEdit(task(row), current.me.id) };
      });
    }
  };
}

export function createSqliteWorkStore(db, canEdit) {
  db.exec(readFileSync(new URL('./work-task-schema.sql', import.meta.url), 'utf8'));
  if (!db.prepare('PRAGMA table_info(work_tasks)').all().some(column => column.name === 'roster_assignee_id')) db.exec('ALTER TABLE work_tasks ADD COLUMN roster_assignee_id TEXT REFERENCES work_assignees(id)');
  if (!db.prepare('PRAGMA table_info(work_tasks)').all().some(column => column.name === 'completed_at')) db.exec('ALTER TABLE work_tasks ADD COLUMN completed_at TEXT');
  db.exec(readFileSync(new URL('./work-journal-schema.sql', import.meta.url), 'utf8'));
  if (!db.prepare('PRAGMA table_info(staff_record_events)').all().some(column => column.name === 'actor_id')) db.exec('ALTER TABLE staff_record_events ADD COLUMN actor_id TEXT REFERENCES work_members(id)');
  db.exec('UPDATE staff_record_events SET actor_id=owner_id WHERE actor_id IS NULL');
  let pending = Promise.resolve();
  const transaction = fn => {
    const result = pending.then(async () => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const value = await fn(async (sql, values) => {
          const params = [];
          const query = sql.replace(/\$(\d+)/g, (_, n) => { params.push(values[Number(n) - 1]); return '?'; });
          const rows = db.prepare(query).all(...params);
          return { rows, rowCount: rows.length };
        });
        db.exec('COMMIT'); return value;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
    pending = result.catch(() => {});
    return result;
  };
  return createWorkStore(transaction, canEdit);
}

export function createPostgresWorkStore(pool, canEdit) {
  const transaction = async fn => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const query = (sql, values) => client.query(sql, values);
      query.forUpdate = ' FOR UPDATE';
      const value = await fn(query);
      await client.query('COMMIT'); return value;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  };
  return createWorkStore(transaction, canEdit);
}
