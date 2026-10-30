import { createHash } from 'node:crypto';
import { workError, newWorkId } from './work-tasks.mjs';
import { workDate } from './work-journal.mjs';
import { recurrenceToday } from '../shared/work-recurrence.mjs';
import { documentDraft, monthDays, leaveTotals } from '../shared/staff-records.mjs';

const text = (value, max = 5000) => { if (typeof value !== 'string' || value.length > max) throw workError(400, '입력 내용을 확인해 주세요.'); return value.trim(); };
const halfDays = (value, max = 366) => { if (typeof value !== 'number' || value < 0 || value > max || !Number.isInteger(value * 2)) throw workError(400, '일수는 0.5일 단위로 입력해 주세요.'); return value; };
const profileFrom = row => row ? { ...JSON.parse(row.payload), version: row.version } : null;
const docFrom = row => row ? { kind: row.kind, period: row.period, payload: JSON.parse(row.payload), version: row.version, status: row.status, sourceHash: row.source_hash, confirmedAt: row.confirmed_at } : null;
const planFrom = row => ({ ...JSON.parse(row.payload), id: row.id, status: row.status, version: row.version });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const checkVersion = (row, version) => { if ((row?.version ?? 0) !== version) throw workError(409, '다른 화면에서 기록이 변경되었습니다. 입력을 보존한 채 최신 기록과 비교해 주세요.'); };

export function createStaffRecordStore(transaction) {
  async function profile(q, owner) {
    const row = (await q(`SELECT * FROM staff_record_profiles WHERE owner_id=$1${q.forUpdate ?? ''}`, [owner])).rows[0];
    if (!row) throw workError(400, '먼저 선택한 직원의 근무기록 기본정보를 등록해 주세요.'); return profileFrom(row);
  }
  async function audit(q, owner, kind, key, action, payload, actor = owner) {
    await q('INSERT INTO staff_record_events(id,owner_id,kind,record_key,action,payload,created_at,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [newWorkId(), owner, kind, key, action, JSON.stringify(payload), new Date().toISOString(), actor]);
  }
  async function source(q, owner, month) {
    const person = await profile(q, owner), dates = monthDays(month);
    const executions = (await q("SELECT * FROM work_executions WHERE assignee_id=$1 AND work_date BETWEEN $2 AND $3 AND status='recorded' ORDER BY work_date,created_at,id", [person.staffId, dates[0], dates.at(-1)])).rows.map(row => ({ id: row.id, version: row.version, date: row.work_date, period: row.period, content: row.content }));
    const attendance = (await q("SELECT * FROM staff_record_documents WHERE owner_id=$1 AND kind='attendance' AND period=$2", [owner, month])).rows[0];
    const plans = (await q("SELECT payload FROM staff_leave_plans WHERE owner_id=$1 AND year=$2 AND status IN ('confirmed','used')", [owner, month.slice(0,4)])).rows;
    const leaveDates = plans.flatMap(row => JSON.parse(row.payload).dates).filter(row => row.date.startsWith(month)).sort((a,b) => a.date.localeCompare(b.date));
    return { person, executions, leaveDates, leaveHash: hash(leaveDates), attendance: docFrom(attendance), sourceHash: hash([person.version, executions, leaveDates]) };
  }
  async function totals(q, owner, year, override) {
    const account = (await q('SELECT * FROM staff_leave_accounts WHERE owner_id=$1 AND year=$2', [owner, year])).rows[0];
    const plans = (await q("SELECT * FROM staff_leave_plans WHERE owner_id=$1 AND year=$2 AND status IN ('confirmed','used')", [owner, year])).rows.map(planFrom);
    const docs = (await q("SELECT * FROM staff_record_documents WHERE owner_id=$1 AND kind='attendance' AND period LIKE $2 AND status='confirmed'", [owner, year+'-%'])).rows;
    let rows = docs.filter(row => !override || row.period !== override.month).flatMap(row => JSON.parse(row.payload).rows);
    if (override) rows = [...rows, ...override.rows];
    return { ...leaveTotals(account?.granted ?? 0, account?.opening_used ?? 0, plans, rows), attendanceUses: rows.filter(row => row.kind === 'leave').map(row => ({ date: row.date, days: row.leaveDays })) };
  }
  function validateDocument(kind, month, payload, confirming) {
    const dates = monthDays(month);
    if (!payload || !Array.isArray(payload.rows) || payload.rows.length !== dates.length || payload.rows.some((row, i) => row.date !== dates[i])) throw workError(400, '한 달의 날짜별 기록을 확인해 주세요.');
    if (!payload.profile || !Array.isArray(payload.imported) || payload.imported.length > 5000 || payload.imported.some(value => typeof value !== 'string' || value.length > 100)) throw workError(400, '문서 기본정보와 근거 연결을 확인해 주세요.');
    for (const key of ['name','organization','jobTitle','startTime','endTime']) text(payload.profile[key], 100);
    for (const row of payload.rows) {
      for (const key of ['note','signature','morning','afternoon','unknown','morningNote','afternoonNote','other']) text(row[key], key === 'signature' ? 100 : 5000);
      if (typeof row.reviewed !== 'boolean') throw workError(400, '검토 상태를 확인해 주세요.');
      if (!['pending','work','off','leave','absent','other'].includes(row.kind)) throw workError(400, '근무 구분을 확인해 주세요.');
      if (!Number.isFinite(row.hours) || row.hours < 0 || row.hours > 24 || ![0.5,1].includes(row.leaveDays)) throw workError(400, '근무시간과 연차 일수를 확인해 주세요.');
      for (const key of ['start','end']) if (row[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(row[key])) throw workError(400, '출퇴근 시각을 확인해 주세요.');
      if (confirming && !row.reviewed) throw workError(400, `${row.date} 기록을 검토해 주세요.`);
      if (confirming && kind === 'attendance' && (row.kind === 'pending' || row.kind === 'work' && (!row.start || !row.end || row.start >= row.end || row.hours <= 0))) throw workError(400, `${row.date} 근태와 출퇴근 시간을 확인해 주세요.`);
      if (confirming && kind === 'attendance' && row.date > recurrenceToday() && ['work','leave'].includes(row.kind)) throw workError(400, `${row.date} 미래 근무·연차 사용은 아직 확정할 수 없습니다.`);
      if (confirming && kind === 'attendance' && ['off','absent'].includes(row.kind) && row.hours !== 0) throw workError(400, `${row.date} 휴무·결근의 근무시간을 확인해 주세요.`);
      if (confirming && kind === 'journal' && row.unknown.trim()) throw workError(400, `${row.date} 시간대 미확인 업무를 오전·오후로 정리해 주세요.`);
    }
  }
  return {
    staffRecordContext(staffId, current) {
      const person = current.assignees.find(person => person.id === staffId);
      if (!person) throw workError(400, '작성 대상 직원을 선택해 주세요.');
      return transaction(async q => {
        const existing = (await q('SELECT owner_id FROM staff_record_profiles WHERE staff_id=$1', [staffId])).rows[0];
        const owner = existing?.owner_id ?? `records:${staffId}`;
        if (!existing) await q('INSERT INTO work_members(id,email,name,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id', [owner, `records+${staffId}@internal.invalid`, person.name, new Date().toISOString()]);
        return { ...current, actorId: current.me.id, recordStaffId: staffId, me: { ...current.me, id: owner } };
      });
    },
    recordProfile(current) { return transaction(async q => profileFrom((await q('SELECT * FROM staff_record_profiles WHERE owner_id=$1', [current.me.id])).rows[0])); },
    saveRecordProfile(body, current) {
      return transaction(async q => {
        const old = (await q(`SELECT * FROM staff_record_profiles WHERE owner_id=$1${q.forUpdate ?? ''}`, [current.me.id])).rows[0]; checkVersion(old, body.version);
        if (!current.assignees.some(person => person.id === body.staffId) || current.recordStaffId && current.recordStaffId !== body.staffId) throw workError(400, '선택한 직원의 기본정보만 저장할 수 있습니다.');
        if (old && old.staff_id !== body.staffId) throw workError(400, '연결한 담당자는 변경할 수 없습니다. 관리자에게 문의해 주세요.');
        if ((await q('SELECT owner_id FROM staff_record_profiles WHERE staff_id=$1', [body.staffId])).rows.some(row => row.owner_id !== current.me.id)) throw workError(409, '직원의 기록 연결이 변경되었습니다. 다시 불러와 주세요.');
        const value = { staffId: body.staffId, name: text(body.name, 60), organization: text(body.organization, 100), jobTitle: text(body.jobTitle, 60), startTime: text(body.startTime, 5), endTime: text(body.endTime, 5), hours: body.hours };
        if (!value.name || !value.organization || !value.jobTitle || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.endTime) || value.startTime >= value.endTime || !Number.isFinite(value.hours) || value.hours <= 0 || value.hours > 24) throw workError(400, '기본정보와 근무시간을 확인해 주세요.');
        const row = old ? (await q('UPDATE staff_record_profiles SET payload=$1,version=version+1 WHERE owner_id=$2 RETURNING *', [JSON.stringify(value), current.me.id])).rows[0] : (await q('INSERT INTO staff_record_profiles(owner_id,staff_id,payload,version) VALUES($1,$2,$3,1) ON CONFLICT DO NOTHING RETURNING *', [current.me.id, body.staffId, JSON.stringify(value)])).rows[0];
        if (!row) throw workError(409, '담당자 연결이 변경되었습니다. 다시 불러와 주세요.');
        await audit(q, current.me.id, 'profile', current.me.id, 'saved', value, current.actorId ?? current.me.id); return profileFrom(row);
      });
    },
    recordMonth(kind, month, current) {
      if (!['attendance','journal'].includes(kind)) throw workError(400, '문서를 선택해 주세요.');
      return transaction(async q => {
        const inputs = await source(q, current.me.id, month);
        if (kind === 'journal') inputs.sourceHash = hash([inputs.sourceHash, inputs.attendance?.version ?? 0, inputs.attendance?.status]);
        const row = (await q('SELECT * FROM staff_record_documents WHERE owner_id=$1 AND kind=$2 AND period=$3', [current.me.id, kind, month])).rows[0];
        return { document: docFrom(row) ?? { kind, period: month, payload: documentDraft(kind, month, inputs.person, inputs.executions), version: 0, status: 'draft', sourceHash: '', confirmedAt: null }, executions: inputs.executions, leaveDates: inputs.leaveDates, attendance: inputs.attendance, sourceHash: inputs.sourceHash, sourceChanged: Boolean(row && row.source_hash !== inputs.sourceHash) };
      });
    },
    saveRecordMonth(kind, month, body, current) {
      if (!['attendance','journal'].includes(kind) || !['save','confirm','reopen'].includes(body.action)) throw workError(400, '문서 저장 요청을 확인해 주세요.');
      return transaction(async q => {
        const inputs = await source(q, current.me.id, month);
        if (kind === 'journal') inputs.sourceHash = hash([inputs.sourceHash, inputs.attendance?.version ?? 0, inputs.attendance?.status]);
        const old = (await q(`SELECT * FROM staff_record_documents WHERE owner_id=$1 AND kind=$2 AND period=$3${q.forUpdate ?? ''}`, [current.me.id, kind, month])).rows[0]; checkVersion(old, body.version);
        if (body.action === 'reopen') {
          if (old?.status !== 'confirmed' || !text(body.reason, 500)) throw workError(400, '확정 문서의 수정 사유를 입력해 주세요.');
        } else if (old?.status === 'confirmed') throw workError(409, '확정 문서는 수정 사유를 남겨 다시 열어주세요.');
        const payload = body.action === 'reopen' ? JSON.parse(old.payload) : body.payload;
        const confirming = body.action === 'confirm'; validateDocument(kind, month, payload, confirming);
        if (confirming && body.sourceHash !== inputs.sourceHash) throw workError(409, '원본 수행·근태 기록이 변경되었습니다. 최신 기록과 비교한 후 확정해 주세요.');
        if (confirming && kind === 'journal' && inputs.attendance?.status !== 'confirmed') throw workError(400, '먼저 해당 월 출근부를 확정해 주세요.');
        if (confirming && kind === 'journal' && inputs.attendance.payload.leaveHash !== inputs.leaveHash) throw workError(400, '연차 계획이 변경되었습니다. 출근부를 먼저 검토하고 재확정해 주세요.');
        if (confirming && kind === 'attendance' && payload.rows.some(row => row.kind === 'leave')) {
          const balance = await totals(q, current.me.id, month.slice(0,4), { month, rows: payload.rows });
          if (balance.remaining < 0) throw workError(400, '연차 사용 일수가 부여 일수를 초과합니다. 연차대장을 확인해 주세요.');
        }
        if (confirming && kind === 'attendance') payload.leaveHash = inputs.leaveHash;
        if (confirming && kind === 'journal') payload.attendance = inputs.attendance.payload.rows.map(row => ({ date: row.date, kind: row.kind, hours: row.hours, leaveDays: row.leaveDays }));
        const row = (await q(`INSERT INTO staff_record_documents(owner_id,kind,period,payload,status,source_hash,version,confirmed_at) VALUES($1,$2,$3,$4,$5,$6,1,$7) ON CONFLICT(owner_id,kind,period) DO UPDATE SET payload=excluded.payload,status=excluded.status,source_hash=excluded.source_hash,version=staff_record_documents.version+1,confirmed_at=excluded.confirmed_at RETURNING *`, [current.me.id, kind, month, JSON.stringify(payload), confirming ? 'confirmed' : 'draft', inputs.sourceHash, confirming ? new Date().toISOString() : null])).rows[0];
        if (kind === 'attendance' && body.action !== 'reopen') {
          const plans = (await q('SELECT * FROM staff_leave_plans WHERE owner_id=$1 AND year=$2', [current.me.id, month.slice(0,4)])).rows;
          for (const day of payload.rows) {
            const autoId = `attendance:${current.me.id}:${day.date}`;
            const auto = plans.find(plan => plan.id === autoId);
            const covered = plans.some(plan => plan.id !== autoId && plan.status !== 'cancelled' && JSON.parse(plan.payload).dates.some(date => date.date === day.date));
            if (auto && auto.status !== 'draft') continue;
            if (day.kind !== 'leave' || covered) {
              if (auto) {
                await q('DELETE FROM staff_leave_plans WHERE id=$1 AND owner_id=$2', [autoId, current.me.id]);
                await audit(q, current.me.id, 'leave-plan', autoId, 'auto-removed', {}, current.actorId ?? current.me.id);
              }
              continue;
            }
            const value = {dates:[{date:day.date,days:day.leaveDays}],leaveReason:day.note,contact:'',substitute:'',applicationDate:recurrenceToday(),profile:payload.profile};
            if (auto && auto.payload === JSON.stringify(value)) continue;
            await q(`INSERT INTO staff_leave_plans(id,owner_id,year,payload,status,version) VALUES($1,$2,$3,$4,'draft',1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=staff_leave_plans.version+1 RETURNING *`, [autoId,current.me.id,month.slice(0,4),JSON.stringify(value)]);
            await audit(q, current.me.id, 'leave-plan', autoId, 'auto-draft', value, current.actorId ?? current.me.id);
          }
        }
        await audit(q, current.me.id, kind, month, body.action, { before: docFrom(old), after: docFrom(row), reason: body.reason ?? '' }, current.actorId ?? current.me.id); return docFrom(row);
      });
    },
    saveRecordWorkspace(month, body, current) {
      return transaction(async q => {
        const store = createStaffRecordStore(fn => fn(q));
        // Check both snapshots before either document changes.
        const before = await store.recordMonth('journal', month, current);
        if (body.journal.sourceHash !== before.sourceHash) throw workError(409, '업무 근거가 변경되었습니다. 다시 불러와 비교해 주세요.');
        const attendance = await store.saveRecordMonth('attendance', month, body.attendance, current);
        const latest = await store.recordMonth('journal', month, current);
        const journal = await store.saveRecordMonth('journal', month, {...body.journal, sourceHash: latest.sourceHash}, current);
        return { attendance, journal };
      });
    },
    leaveLedger(year, current) {
      if (!/^\d{4}$/.test(year) || year < '1000') throw workError(400, '연도를 확인해 주세요.');
      return transaction(async q => { await profile(q, current.me.id); const balance = await totals(q, current.me.id, year); return { account: (await q('SELECT * FROM staff_leave_accounts WHERE owner_id=$1 AND year=$2', [current.me.id, year])).rows[0] ?? { granted: 0, opening_used: 0, version: 0 }, plans: (await q('SELECT * FROM staff_leave_plans WHERE owner_id=$1 AND year=$2 ORDER BY id', [current.me.id, year])).rows.map(planFrom), totals: balance, attendanceUses: balance.attendanceUses }; });
    },
    saveLeaveAccount(year, body, current) {
      if (!/^\d{4}$/.test(year) || year < '1000') throw workError(400, '연도를 확인해 주세요.');
      return transaction(async q => {
        await profile(q, current.me.id);
        const old = (await q(`SELECT * FROM staff_leave_accounts WHERE owner_id=$1 AND year=$2${q.forUpdate ?? ''}`, [current.me.id, year])).rows[0]; checkVersion(old, body.version);
        const granted = halfDays(body.granted), used = halfDays(body.openingUsed);
        await q(`INSERT INTO staff_leave_accounts(owner_id,year,granted,opening_used,version) VALUES($1,$2,$3,$4,1) ON CONFLICT(owner_id,year) DO UPDATE SET granted=excluded.granted,opening_used=excluded.opening_used,version=staff_leave_accounts.version+1 RETURNING *`, [current.me.id, year, granted, used]);
        const balance = await totals(q, current.me.id, year); if (balance.available < 0) throw workError(400, '이미 사용·계획한 연차보다 부여 일수가 적습니다.');
        await audit(q, current.me.id, 'leave-account', year, 'saved', { granted, openingUsed: used }, current.actorId ?? current.me.id); return balance;
      });
    },
    saveLeavePlan(id, body, current) {
      return transaction(async q => {
        const person = await profile(q, current.me.id);
        const old = id ? (await q(`SELECT * FROM staff_leave_plans WHERE id=$1 AND owner_id=$2${q.forUpdate ?? ''}`, [id, current.me.id])).rows[0] : null;
        if (id && !old) throw workError(404, '연차 계획을 찾을 수 없습니다.'); checkVersion(old, body.version);
        if (!['draft','confirmed','used','cancelled'].includes(body.status)) throw workError(400, '연차 상태를 확인해 주세요.');
        if (old && old.status !== 'draft' && body.status !== 'draft' && body.status !== 'cancelled' && !(old.status === 'confirmed' && body.status === 'used')) throw workError(409, '확정한 계획은 수정 사유를 남겨 다시 열어주세요.');
        if (old && old.status !== 'draft' && body.status === 'draft' && !text(body.reason, 500)) throw workError(400, '재수정 사유를 입력해 주세요.');
        if (!Array.isArray(body.dates) || !body.dates.length || body.dates.length > 366) throw workError(400, '연차 날짜를 지정해 주세요.');
        const dates = body.dates.map(row => ({ date: workDate(row.date), days: halfDays(row.days, 1) }));
        const year = dates[0].date.slice(0,4);
        if (new Set(dates.map(row => row.date)).size !== dates.length || dates.some(row => row.date.slice(0,4) !== year || ![0.5,1].includes(row.days))) throw workError(400, '같은 연도의 중복되지 않는 날짜를 선택해 주세요.');
        if (body.status === 'used' && dates.some(row => row.date > recurrenceToday())) throw workError(400, '미래 연차는 사용 완료로 처리할 수 없습니다.');
        const others = (await q("SELECT * FROM staff_leave_plans WHERE owner_id=$1 AND year=$2 AND status IN ('confirmed','used')", [current.me.id, year])).rows.filter(row => row.id !== id).map(planFrom);
        if (['confirmed','used'].includes(body.status) && others.some(plan => plan.dates.some(row => dates.some(date => date.date === row.date)))) throw workError(409, '같은 날짜의 연차 계획이 있습니다.');
        const value = { dates, leaveReason: text(body.leaveReason, 1000), contact: text(body.contact, 100), substitute: text(body.substitute, 100), applicationDate: workDate(body.applicationDate), profile: { name: person.name, organization: person.organization, jobTitle: person.jobTitle } };
        if (old && old.status !== 'draft' && body.status !== 'draft') {
          const frozen = JSON.parse(old.payload);
          if (['dates','leaveReason','contact','substitute','applicationDate'].some(key => JSON.stringify(frozen[key]) !== JSON.stringify(value[key]))) throw workError(409, '확정한 계획의 내용은 다시 열어 수정해 주세요.');
          value.profile = frozen.profile;
        }
        if (body.status !== 'draft' && body.status !== 'cancelled' && (!value.leaveReason || !value.substitute)) throw workError(400, '휴가 사유와 업무대행자를 입력해 주세요.');
        const planId = id ?? newWorkId();
        const row = (await q(`INSERT INTO staff_leave_plans(id,owner_id,year,payload,status,version) VALUES($1,$2,$3,$4,$5,1) ON CONFLICT(id) DO UPDATE SET year=excluded.year,payload=excluded.payload,status=excluded.status,version=staff_leave_plans.version+1 RETURNING *`, [planId, current.me.id, year, JSON.stringify(value), body.status])).rows[0];
        const balance = await totals(q, current.me.id, year); if (balance.available < 0 && ['confirmed','used'].includes(body.status)) throw workError(400, '사용 가능한 연차 일수를 초과합니다.');
        await audit(q, current.me.id, 'leave-plan', planId, body.status, { before: old && planFrom(old), after: planFrom(row), reason: body.reason ?? '' }, current.actorId ?? current.me.id); return planFrom(row);
      });
    }
  };
}
