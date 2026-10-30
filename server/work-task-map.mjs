import { trafficBoard, monthDates } from '../shared/work-traffic.mjs';
import { newWorkId, workError } from './work-tasks.mjs';
import { workDate, journalEvent } from './work-journal.mjs';

const decode = row => ({ id: row.id, ...JSON.parse(row.payload), version: Number(row.version) });
const text = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit;
const todayInSeoul = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function datedSteps(map, date, assigneeId) {
  return map.steps.map(s => {
    const due = new Date(date+'T12:00:00Z'); due.setUTCDate(due.getUTCDate()+(s.dueOffsetDays ?? 0));
    const dueDate = workDate(due.toISOString().slice(0,10));
    return { ...s, assigneeId: s.assigneeId || assigneeId, dueDate, completedAt: null, completedBy: null, executionId: null };
  });
}
export function normalizeTaskMap(body) {
  if (!body || !text(body.title, 200) || !['daily', 'monthly', 'event'].includes(body.kind) || !Array.isArray(body.steps) || !body.steps.length || body.steps.length > 40 || body.steps.some(s => !text(s.title, 200) || typeof s.guide !== 'string' || s.guide.length > 2000)) throw workError(400, '제목과 1~40개의 하위 업무를 확인해 주세요.');
  if (!['operations','service','recipient','staff','rights'].includes(body.category)) throw workError(400, '서비스 분류를 확인해 주세요.');
  let schedule;
  if (body.schedule) {
    const { assigneeId, startDate, weekdays } = body.schedule;
    workDate(startDate);
    if (!text(assigneeId, 100) || !Array.isArray(weekdays) || !weekdays.length || weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw workError(400, '담당자와 점검 요일을 확인해 주세요.');
    if (body.schedule.enabled !== undefined && typeof body.schedule.enabled !== 'boolean') throw workError(400, '반복 활성화 설정을 확인해 주세요.');
    schedule = { assigneeId, startDate, weekdays: [...new Set(weekdays)], enabled: body.schedule.enabled !== false };
  }
  const dueDay = body.dueDay ?? 25;
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw workError(400, '월간 점검일을 확인해 주세요.');
  return { title: body.title.trim(), kind: body.kind, category: body.category, dueDay, schedule, createdAt: new Date().toISOString(), steps: body.steps.map(s => {
    if (s.assigneeId != null && s.assigneeId !== '' && !text(s.assigneeId,100) || s.dueOffsetDays !== undefined && (!Number.isInteger(s.dueOffsetDays) || s.dueOffsetDays < 0 || s.dueOffsetDays > 365)) throw workError(400, '단계별 담당자와 기한(0~365일)을 확인해 주세요.');
    return { id: newWorkId(), title: s.title.trim(), guide: s.guide.trim(), assigneeId: s.assigneeId || null, dueOffsetDays: s.dueOffsetDays ?? 0 };
  }) };
}
export function createTaskMapStore(transaction, resolveRelated) {
  async function generateDaily(q, templates, today) {
    if (!templates.some(t=>t.kind==='daily' && t.schedule)) return;
    const existing = new Set((await q('SELECT * FROM work_map_runs WHERE work_date LIKE $1',[today.slice(0,7)+'%'])).rows.filter(row=>!decode(row).related.length).map(row=>{const run=decode(row);return `${run.templateId ?? JSON.parse(row.run_key)[0]}:${run.date}`;}));
    const pending = [];
    for (const map of templates.filter(t=>t.kind==='daily' && t.schedule)) {
      for (const date of monthDates(today.slice(0,7)).filter(d=>d<=today)) {
        const config = [...(map.scheduleHistory ?? []),{schedule:map.schedule}].filter(c=>c.schedule && c.schedule.startDate<=date).sort((a,b)=>a.schedule.startDate.localeCompare(b.schedule.startDate)).at(-1)?.schedule;
        if (!config || config.enabled===false || !config.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay())) continue;
        const key = JSON.stringify([map.id,date,[]]);
        if(existing.has(`${map.id}:${date}`)) continue;
        const steps = datedSteps(map,date,config.assigneeId);
        const payload = { templateId:map.id,templateVersion:map.version,createdAt:new Date().toISOString(),title:map.title,kind:map.kind,category:map.category,date,dueDate:steps.reduce((due,s)=>s.dueDate>due?s.dueDate:due,date),assigneeId:config.assigneeId,related:[],steps };
        pending.push([newWorkId(),key,date,JSON.stringify(payload)]);
      }
    }
    for(let offset=0;offset<pending.length;offset+=200) {
      const values=[];
      const rows=pending.slice(offset,offset+200).map(row=>'('+row.map(value=>{values.push(value);return '$'+values.length;}).join(',')+',1)');
      await q('INSERT INTO work_map_runs(id,run_key,work_date,payload,version) VALUES '+rows.join(',')+' ON CONFLICT(run_key) DO NOTHING RETURNING id',values);
    }
  }
  return {
    ensureDailyTaskMaps(today = todayInSeoul()) { workDate(today); return transaction(async q=>generateDaily(q,(await q(`SELECT * FROM work_map_templates ORDER BY id${q.forUpdate ?? ''}`,[])).rows.map(decode),today)); },
    taskMaps(month, ensureDaily = false) { return transaction(async q => {
      const today = todayInSeoul();
      month ??= today.slice(0,7); workDate(month+'-01');
      const templates = (await q(`SELECT * FROM work_map_templates ORDER BY id${ensureDaily ? q.forUpdate ?? '' : ''}`, [])).rows.map(decode).sort((a,b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
      if(ensureDaily) await generateDaily(q,templates,today);
      const runs = (await q('SELECT * FROM work_map_runs ORDER BY work_date DESC,id', [])).rows.map(row => { const run = decode(row); return { ...run, templateId: run.templateId ?? JSON.parse(row.run_key)[0] }; });
      return { templates, runs, month, today, nodes: trafficBoard(templates, runs, month, today) };
    }); },
    saveTaskMap(body, current) {
      const input = normalizeTaskMap(body);
      if (input.kind !== 'event' && !input.schedule && current) throw workError(400, '반복 점검의 담당자와 시작일을 지정해 주세요.');
      if (input.schedule && !current?.assignees.some(a => a.id === input.schedule.assigneeId)) throw workError(400, '담당자를 확인해 주세요.');
      if (current && input.steps.some(s=>s.assigneeId && !current.assignees.some(a=>a.id===s.assigneeId))) throw workError(400, '단계 담당자를 확인해 주세요.');
      return transaction(async q => {
        if (body.id) {
          const previous = (await q(`SELECT * FROM work_map_templates WHERE id=$1${q.forUpdate ?? ''}`, [body.id])).rows[0];
          if (!previous || Number(previous.version) !== body.version) throw workError(409, '설계가 변경되었습니다. 새로고침 후 다시 편집해 주세요.');
          const old = decode(previous);
          if (old.kind !== input.kind) throw workError(400, '기존 기록의 집계를 위해 업무 유형은 유지해 주세요. 새 유형은 별도 설계로 추가합니다.');
          input.createdAt = old.createdAt ?? ''; 
          input.scheduleHistory = old.scheduleHistory ?? [];
          const changed = JSON.stringify(old.schedule ? { ...old.schedule, enabled: old.schedule.enabled !== false } : undefined) !== JSON.stringify(input.schedule) || old.dueDay !== input.dueDay;
          if (old.schedule && changed) {
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            if (!input.schedule || input.schedule.startDate < today || input.schedule.startDate < old.schedule.startDate) throw workError(400, '지난 점검 기준을 보존하려면 새 적용 시작일을 오늘 이후로 지정해 주세요.');
            input.scheduleHistory = [...input.scheduleHistory, { schedule: old.schedule, dueDay: old.dueDay }];
          }
          const saved = (await q('UPDATE work_map_templates SET payload=$1,version=version+1 WHERE id=$2 AND version=$3 RETURNING *', [JSON.stringify(input), body.id, body.version])).rows[0];
          if (!saved) throw workError(409, '설계가 변경되었습니다.');
          return decode(saved);
        }
        return decode((await q('INSERT INTO work_map_templates(id,payload,version) VALUES($1,$2,1) RETURNING *', [newWorkId(), JSON.stringify(input)])).rows[0]);
      });
    },
    startTaskMap(body, current) {
      const date = workDate(body.date);
      if (!current.assignees.some(a => a.id === body.assigneeId)) throw workError(400, '담당자를 선택해 주세요.');
      return transaction(async q => {
        const template = (await q(`SELECT * FROM work_map_templates WHERE id=$1${q.forUpdate ?? ''}`, [body.templateId])).rows[0];
        if (!template) throw workError(404, '태스크 맵을 찾을 수 없습니다.');
        const map = decode(template);
        if (!Array.isArray(body.related) || body.related.length > 30 || body.related.some(r => !r || !['recipient','worker'].includes(r.type) || !text(r.id, 100))) throw workError(400, '연결 대상을 확인해 주세요.');
        const links = [...new Map(body.related.map(r=>[`${r.type}:${r.id}`,r])).values()].sort((a,b)=>`${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
        const related = links.length ? await resolveRelated(q, links) : [];
        const relatedKeys = related.map(r => `${r.type}:${r.id}`);
        const key = JSON.stringify([map.id, map.kind === 'monthly' ? date.slice(0,7) : date, map.kind === 'monthly' ? [] : relatedKeys]);
        const candidates = map.kind === 'monthly'
          ? (await q('SELECT * FROM work_map_runs WHERE work_date LIKE $1 ORDER BY work_date,id',[date.slice(0,7)+'%'])).rows
          : (await q('SELECT * FROM work_map_runs WHERE work_date=$1',[date])).rows;
        const previous = candidates.find(row=>{ const run=decode(row);return (run.templateId ?? JSON.parse(row.run_key)[0])===map.id && (map.kind === 'monthly' || JSON.stringify(run.related.map(r=>`${r.type}:${r.id}`).sort())===JSON.stringify([...relatedKeys].sort())); });
        if(previous) return decode(previous);
        const dueDate = workDate(body.dueDate || date);
        if (dueDate < date) throw workError(400, '기한은 시작일 이후로 지정해 주세요.');
        const steps = datedSteps(map,date,body.assigneeId);
        const payload = { templateId: map.id, templateVersion: map.version, createdAt: new Date().toISOString(), dueDate: steps.reduce((due,s)=>s.dueDate>due?s.dueDate:due,dueDate), title: map.title, kind: map.kind, category: map.category, date, assigneeId: body.assigneeId, related, steps };
        const inserted = (await q('INSERT INTO work_map_runs(id,run_key,work_date,payload,version) VALUES($1,$2,$3,$4,1) ON CONFLICT(run_key) DO NOTHING RETURNING *', [newWorkId(), key, date, JSON.stringify(payload)])).rows[0];
        return decode(inserted ?? (await q('SELECT * FROM work_map_runs WHERE run_key=$1', [key])).rows[0]);
      });
    },
    checkTaskMap(id, body, current) {
      return transaction(async q => {
        const row = (await q(`SELECT * FROM work_map_runs WHERE id=$1${q.forUpdate ?? ''}`, [id])).rows[0];
        if (!row) throw workError(404, '업무 묶음을 찾을 수 없습니다.');
        if (Number(row.version) !== body.version) throw workError(409, '다른 사용자가 변경했습니다. 새로고침 후 확인해 주세요.');
        const run = decode(row), step = run.steps[body.step];
        if (!Number.isInteger(body.step) || !step || step.completedAt) throw workError(409, '이미 완료했거나 유효하지 않은 단계입니다. 새로고침 후 확인해 주세요.');
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        if (run.date > today && (run.kind !== 'monthly' || run.date.slice(0,7) !== today.slice(0,7))) throw workError(400, '미래 날짜에는 완료할 수 없습니다.');
        const now = new Date().toISOString(), executionId = newWorkId();
        const content = `${run.title} · ${step.title}`, snapshot = { title: content, category: run.category, related: run.related };
        const execution = (await q(`INSERT INTO work_executions(id,task_id,plan_id,assignee_id,work_date,period,content,snapshot,status,version,created_by,updated_by,created_at,updated_at) VALUES($1,NULL,NULL,$2,$3,'unknown',$4,$5,'recorded',1,$6,$6,$7,$7) RETURNING *`, [executionId, step.assigneeId || run.assigneeId, run.kind === 'monthly' ? today : run.date, content, JSON.stringify(snapshot), current.me.id, now])).rows[0];
        await journalEvent(q, 'execution', execution, 'created', current.me.id);
        Object.assign(step, { completedAt: now, completedBy: current.me.name, completedById: current.me.id, executionId });
        const { id: ignoredId, version: ignoredVersion, ...payload } = run;
        const saved = (await q('UPDATE work_map_runs SET payload=$1,version=version+1 WHERE id=$2 AND version=$3 RETURNING *', [JSON.stringify(payload), id, body.version])).rows[0];
        if (!saved) throw workError(409, '업무 상태가 변경되었습니다. 새로고침해 주세요.');
        return decode(saved);
      });
    }
  };
}
