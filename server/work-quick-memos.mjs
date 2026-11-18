import { normalizeWorkTask, workError } from './work-tasks.mjs';
import { executionFromRow, journalEvent, planFromRow, workDate, workRequestId } from './work-journal.mjs';
import { monthDates } from '../shared/work-traffic.mjs';

const pageSize = 30;
const selection = `SELECT m.id,m.author_id,m.title,m.related_name,m.author_name,m.created_at,m.closed_at,m.closed_by_name,m.task_id,
  e.assignee_id AS stamp_assignee_id FROM work_quick_memos m LEFT JOIN work_executions e ON e.id=m.id`;
const publicMemo = (row, viewerId) => ({
  id: row.id, title: row.title, relatedName: row.related_name, authorName: row.author_name, createdAt: row.created_at,
  closedAt: row.closed_at, closedByName: row.closed_by_name, taskId: row.task_id, stampAssigneeId: row.stamp_assignee_id ?? null,
  ...(viewerId ? { canDelete: !row.closed_at && row.author_id === viewerId } : {})
});
const seoulHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' });
const seoulDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });

export function createQuickMemoStore(transaction, createTask) {
  async function read(q, id, lock = false) {
    const row = (await q(`SELECT * FROM work_quick_memos WHERE id=$1${lock ? q.forUpdate ?? '' : ''}`, [id])).rows[0];
    if (!row) throw workError(404, '메모를 찾을 수 없습니다.');
    return row;
  }

  return {
    quickMemos(closed, before, month = null, viewerId) {
      return transaction(async q => {
        const order = closed && month === null ? 'closed_at' : 'created_at';
        const conditions = ['m.deleted_at IS NULL', closed ? 'm.closed_at IS NOT NULL' : 'm.closed_at IS NULL'];
        const values = [pageSize + 1];
        if (before) {
          const row = await read(q, workRequestId(before));
          values.push(row[order], row.id);
          conditions.push(`(m.${order} < $2 OR (m.${order} = $2 AND m.id < $3))`);
        }
        if (month !== null) {
          const first = workDate(month + '-01');
          const last = monthDates(month).at(-1);
          const start = new Date(first + 'T00:00:00+09:00').toISOString();
          const end = new Date(last + 'T23:59:59.999+09:00').toISOString();
          values.push(start, end);
          conditions.push(`m.created_at BETWEEN $${values.length - 1} AND $${values.length}`);
        }
        const { rows } = await q(`${selection} WHERE ${conditions.join(' AND ')}
          ORDER BY m.${order} DESC,m.id DESC LIMIT $1`, values);
        const items = rows.slice(0, pageSize).map(row => publicMemo(row, viewerId));
        return { items, next: rows.length > pageSize ? items.at(-1).id : null };
      });
    },
    createQuickMemo(body, current) {
      const id = workRequestId(body.requestId);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title || title.length > 200 || /[\r\n]/.test(title)) throw workError(400, '메모를 한 줄로 200자까지 입력해 주세요.');
      const relatedName = body.relatedName ?? '';
      if (typeof relatedName !== 'string' || relatedName.length > 80 || /[\r\n]/.test(relatedName)) {
        throw workError(400, '관련자 이름을 한 줄로 80자까지 입력해 주세요.');
      }
      return transaction(async q => {
        const row = (await q(`INSERT INTO work_quick_memos(id,title,related_name,author_id,author_name,created_at)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING RETURNING *`,
          [id, title, relatedName.trim(), current.me.id, current.me.name, new Date().toISOString()])).rows[0] ?? await read(q, id);
        if (row.deleted_at) throw workError(409, '이미 삭제된 메모입니다.');
        if (row.author_id !== current.me.id || row.title !== title || row.related_name !== relatedName.trim()) throw workError(409, '이미 사용된 메모 저장 요청입니다.');
        return publicMemo(row);
      });
    },
    deleteQuickMemo(id, current) {
      return transaction(async q => {
        const row = await read(q, workRequestId(id), true);
        if (row.author_id !== current.me.id) throw workError(403, '작성자만 포스트잇을 삭제할 수 있습니다.');
        if (row.closed_at) throw workError(409, '완료된 포스트잇은 삭제할 수 없습니다.');
        if (!row.deleted_at) {
          await q("UPDATE work_quick_memos SET deleted_at=$1,title='',related_name='' WHERE id=$2", [new Date().toISOString(), id]);
        }
        return { id };
      });
    },
    closeQuickMemo(id, body, current, convert) {
      const assignee = current.assignees.find(person => person.id === body.assigneeId);
      if (!convert && !assignee) throw workError(400, '수행한 담당자의 이름 도장을 선택해 주세요.');
      return transaction(async q => {
        const row = await read(q, workRequestId(id), true);
        if (row.deleted_at) throw workError(404, '삭제된 메모입니다.');
        if (row.closed_at) {
          if (convert && row.task_id) return { memo: publicMemo(row) };
          const existing = (await q('SELECT * FROM work_executions WHERE id=$1', [id])).rows[0];
          if (!convert && existing?.assignee_id === assignee.id && existing.status === 'recorded') {
            return { memo: publicMemo({ ...row, stamp_assignee_id: assignee.id }), execution: executionFromRow(existing) };
          }
          throw workError(409, '동료가 이미 처리한 메모입니다. 목록을 다시 확인해 주세요.');
        }
        let task, plan, execution;
        const now = new Date();
        if (convert) {
          const input = normalizeWorkTask({ title: row.title, assigneeId: body.assigneeId, dueDate: body.dueDate,
            category: 'unclassified', related: [], requestId: id });
          if (!input.assigneeId && !input.dueDate) throw workError(400, '담당자 또는 기한을 지정해 주세요.');
          task = await createTask(q, input, current);
        } else {
          const date = seoulDate.format(now), iso = now.toISOString(), actor = current.me.id;
          const input = normalizeWorkTask({ title: row.title, assigneeId: assignee.id, category: 'unclassified', related: [], requestId: id });
          task = await createTask(q, input, current, iso);
          const snapshot = JSON.stringify({ title: row.title, category: 'unclassified', related: [], sourceMemoId: id });
          const planned = (await q(`INSERT INTO work_plans(id,task_id,assignee_id,work_date,period,snapshot,status,version,created_by,updated_by,created_at,updated_at)
            VALUES($1,$1,$2,$3,'unknown',$4,'planned',1,$5,$5,$6,$6) RETURNING *`, [id, assignee.id, date, snapshot, actor, iso])).rows[0];
          const performed = (await q(`INSERT INTO work_executions(id,task_id,plan_id,assignee_id,work_date,period,content,snapshot,status,version,created_by,updated_by,created_at,updated_at)
            VALUES($1,$1,$1,$2,$3,$4,$5,$6,'recorded',1,$7,$7,$8,$8) RETURNING *`,
            [id, assignee.id, date, Number(seoulHour.format(now)) < 12 ? 'morning' : 'afternoon', row.title, snapshot, actor, iso])).rows[0];
          await journalEvent(q, 'plan', planned, 'created', actor);
          await journalEvent(q, 'execution', performed, 'created', actor);
          plan = planFromRow(planned);
          execution = executionFromRow(performed);
        }
        const saved = (await q(`UPDATE work_quick_memos SET closed_at=$1,closed_by_name=$2,task_id=$3
          WHERE id=$4 RETURNING *`, [now.toISOString(), convert ? current.me.name : assignee.name, convert ? task.id : null, id])).rows[0];
        return { memo: publicMemo({ ...saved, stamp_assignee_id: execution?.assigneeId }), task, plan, execution };
      });
    }
  };
}
