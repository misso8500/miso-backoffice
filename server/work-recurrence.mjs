import { newWorkId, workError } from './work-tasks.mjs';
import { recurrenceDates, recurrenceTitle, recurrenceToday } from '../shared/work-recurrence.mjs';

export const defaultCategoryNames = { unclassified: '미분류 · 나중에 정리', recipient: '수급자 관리', service: '서비스 관리', staff: '인력 관리', operations: '기관 운영', rights: '권익·안전 관리' };
export const canManageCategories = current => (process.env.WORK_CATEGORY_ADMIN_EMAILS ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean).includes(current.me.email.toLowerCase());
const fromRow = row => ({ id: row.id, ownerId: row.owner_id, assigneeId: row.assignee_id, title: row.title, description: row.description, category: row.category, kind: row.kind, dueDay: row.due_day, includeSaturday: Boolean(row.include_saturday), includeSunday: Boolean(row.include_sunday), includeLeave: Boolean(row.include_leave), active: Boolean(row.active), startMonth: row.start_month, version: row.version });
export async function validateWorkCategory(q, id, previous) {
  for (const [key, name] of Object.entries(defaultCategoryNames)) await q('INSERT INTO work_categories(id,name,active,version) VALUES($1,$2,1,1) ON CONFLICT(id) DO NOTHING RETURNING id', [key, name]);
  const row = (await q('SELECT * FROM work_categories WHERE id=$1', [id])).rows[0];
  if (!row || !row.active && id !== previous) throw workError(400, '사용할 수 없는 카테고리입니다.');
}
export function normalizeRecurrence(body, current) {
  if (!body || !['monthly', 'daily'].includes(body.kind)) throw workError(400, '반복 주기를 선택해 주세요.');
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 450 || typeof body.description !== 'string' || body.description.length > 5000) throw workError(400, '업무 제목과 내용을 확인해 주세요.');
  if (!current.assignees.some(person => person.id === body.assigneeId)) throw workError(400, '업무 담당자를 선택해 주세요.');
  if (!Number.isInteger(body.dueDay) || body.dueDay < 1 || body.dueDay > 31) throw workError(400, '마감일은 1~31일로 지정해 주세요.');
  for (const key of ['includeSaturday', 'includeSunday', 'includeLeave', 'active']) if (typeof body[key] !== 'boolean') throw workError(400, '반복 설정을 확인해 주세요.');
  if (!body.includeLeave && body.kind === 'daily') throw workError(400, '연차 제외는 근무기록 연동 후 사용할 수 있습니다.');
  if (typeof body.category !== 'string') throw workError(400, '카테고리를 선택해 주세요.');
  if (body.requestId && (typeof body.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.requestId))) throw workError(400, '등록 요청을 확인해 주세요.');
  return { ...body, title: body.title.trim(), description: body.description.trim() };
}
export function createRecurrenceStore(transaction) {
  async function seed(q) {
    for (const [id, name] of Object.entries(defaultCategoryNames)) await q('INSERT INTO work_categories(id,name,active,version) VALUES($1,$2,1,1) ON CONFLICT(id) DO NOTHING RETURNING id', [id, name]);
  }
  async function category(q, id, previous) {
    const row = (await q('SELECT * FROM work_categories WHERE id=$1', [id])).rows[0];
    if (!row || !row.active && id !== previous) throw workError(400, '사용할 수 없는 카테고리입니다.');
  }
  async function generate(q, raw, today) {
    const rule = fromRow(raw), month = today.slice(0, 7);
    if (!rule.active || month < rule.startMonth || rule.kind === 'daily' && !rule.includeLeave) return 0;
    const activeCategory = (await q('SELECT * FROM work_categories WHERE id=$1', [rule.category])).rows[0];
    const existing = new Set((await q('SELECT occurrence FROM work_recurrence_instances WHERE rule_id=$1 AND occurrence LIKE $2', [rule.id, month + '%'])).rows.map(row => row.occurrence));
    const now = new Date().toISOString();
    const items = recurrenceDates(rule, month).map(date => ({ date, occurrence: rule.kind === 'monthly' ? month : date })).filter(item => !existing.has(item.occurrence)).map(item => ({ ...item, id: newWorkId(), title: recurrenceTitle(rule.title, item.date), category: activeCategory?.active ? rule.category : 'unclassified' }));
    if (!items.length) return 0;
    const values = [];
    const bind = value => { values.push(value); return '$' + values.length; };
    const taskRows = items.map(item => '(' + [bind(item.id),bind(rule.ownerId),bind(rule.assigneeId),bind(item.title),bind(rule.description),bind(item.category),bind(item.date),"'[]'","'open'",'1',bind(now),bind(now),bind(rule.ownerId)].join(',') + ')');
    await q('INSERT INTO work_tasks(id,requester_id,roster_assignee_id,title,description,category,due_date,related,status,version,created_at,updated_at,updated_by) VALUES ' + taskRows.join(',') + ' RETURNING id', values);
    values.length = 0;
    const instances = items.map(item => '(' + [bind(rule.id),bind(item.occurrence),bind(item.id)].join(',') + ')');
    await q('INSERT INTO work_recurrence_instances(rule_id,occurrence,task_id) VALUES ' + instances.join(',') + ' RETURNING task_id', values);
    values.length = 0;
    const events = items.map(item => {
      const payload = { id: item.id, requesterId: rule.ownerId, assigneeId: rule.assigneeId, title: item.title, description: rule.description, category: item.category, dueDate: item.date, related: [], status: 'open', completedAt: null, version: 1, createdAt: now, updatedAt: now, updatedBy: rule.ownerId, recurrenceRuleId: rule.id, automatic: true };
      return '(' + [bind(newWorkId()),bind(item.id),'1',bind(rule.ownerId),"'created'",bind(JSON.stringify(payload)),bind(now)].join(',') + ')';
    });
    await q('INSERT INTO work_task_events(id,task_id,version,actor_id,kind,payload,created_at) VALUES ' + events.join(',') + ' RETURNING id', values);
    return items.length;
  }
  return {
    categories() { return transaction(async q => { await seed(q); return (await q('SELECT * FROM work_categories ORDER BY id', [])).rows; }); },
    validateCategory: (id, previous) => transaction(async q => { await seed(q); await category(q, id, previous); }),
    categoryChange(id, body, current, remove = false) {
      if (!canManageCategories(current)) throw workError(403, '개발자 계정만 카테고리를 관리할 수 있습니다.');
      if (remove && id === 'unclassified') throw workError(400, '기본 미분류는 삭제할 수 없습니다.');
      if (!remove && (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 60)) throw workError(400, '카테고리 이름을 60자 이내로 입력해 주세요.');
      return transaction(async q => {
        await seed(q);
        if (!remove && (await q('SELECT id FROM work_categories WHERE name=$1 AND active=1', [body.name.trim()])).rows.some(row => row.id !== id)) throw workError(409, '같은 이름의 카테고리가 있습니다.');
        if (!id) return (await q('INSERT INTO work_categories(id,name,active,version) VALUES($1,$2,1,1) RETURNING *', [newWorkId(), body.name.trim()])).rows[0];
        const row = (await q(`UPDATE work_categories SET name=CASE WHEN $1=1 THEN name ELSE $2 END,active=$3,version=version+1 WHERE id=$4 AND version=$5 AND active=1 RETURNING *`, [remove ? 1 : 0, remove ? '' : body.name.trim(), remove ? 0 : 1, id, body.version])).rows[0];
        if (!row) throw workError(409, '카테고리가 변경되었습니다. 다시 불러와 주세요.');
        return row;
      });
    },
    recurrenceRules(current) { return transaction(async q => (await q('SELECT * FROM work_recurrence_rules WHERE owner_id=$1 ORDER BY created_at,id', [current.me.id])).rows.map(fromRow)); },
    saveRecurrence(id, body, current) {
      const input = normalizeRecurrence(body, current);
      return transaction(async q => {
        await seed(q);
        const ruleId = id ?? body.requestId ?? newWorkId();
        const old = (await q(`SELECT * FROM work_recurrence_rules WHERE id=$1${q.forUpdate ?? ''}`, [ruleId])).rows[0];
        if (old && old.owner_id !== current.me.id) throw workError(404, '나의 반복 업무를 찾을 수 없습니다.');
        if (id && !old) throw workError(404, '나의 반복 업무를 찾을 수 없습니다.');
        if (!id && old) {
          const previous = fromRow(old);
          if (old.version !== 1 || ['title','description','category','assigneeId','kind','dueDay','includeSaturday','includeSunday','includeLeave','active'].some(key => previous[key] !== input[key])) throw workError(409, '이미 처리된 등록 요청입니다. 새로 작성하거나 기존 규칙을 확인해 주세요.');
          return { rule: previous, created: 0 };
        }
        if (old && old.version !== body.version) throw workError(409, '다른 화면에서 규칙을 변경했습니다. 다시 불러와 주세요.');
        await category(q, input.category, old?.category);
        const now = new Date().toISOString();
        const values = [input.assigneeId, input.title, input.description, input.category, input.kind, input.dueDay, Number(input.includeSaturday), Number(input.includeSunday), Number(input.includeLeave), Number(input.active), now, ruleId, current.me.id];
        const row = old ? (await q(`UPDATE work_recurrence_rules SET assignee_id=$1,title=$2,description=$3,category=$4,kind=$5,due_day=$6,include_saturday=$7,include_sunday=$8,include_leave=$9,active=$10,updated_at=$11,version=version+1 WHERE id=$12 AND owner_id=$13 RETURNING *`, values)).rows[0]
          : (await q(`INSERT INTO work_recurrence_rules(assignee_id,title,description,category,kind,due_day,include_saturday,include_sunday,include_leave,active,updated_at,id,owner_id,created_at,start_month,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$11,$14,1) ON CONFLICT(id) DO NOTHING RETURNING *`, [...values, recurrenceToday().slice(0, 7)])).rows[0];
        if (!row) {
          const existing = (await q('SELECT * FROM work_recurrence_rules WHERE id=$1', [ruleId])).rows[0], previous = existing && fromRow(existing);
          if (!previous || previous.ownerId !== current.me.id || previous.version !== 1 || ['title','description','category','assigneeId','kind','dueDay','includeSaturday','includeSunday','includeLeave','active'].some(key => previous[key] !== input[key])) throw workError(409, '이미 처리된 등록 요청입니다.');
          return { rule: previous, created: 0 };
        }
        const created = await generate(q, row, recurrenceToday());
        return { rule: fromRow(row), created };
      });
    },
    ensureRecurring(today = recurrenceToday()) {
      return transaction(async q => {
        await seed(q); let created = 0;
        const rules = (await q(`SELECT * FROM work_recurrence_rules WHERE active=1 ORDER BY id${q.forUpdate ?? ''}`, [])).rows;
        for (const rule of rules) created += await generate(q, rule, today);
        return { month: today.slice(0, 7), created };
      });
    }
  };
}
