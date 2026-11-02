import { workError } from './work-tasks.mjs';
import { recipientNotDeleted } from './recipient-deletions.mjs';
import { emptyRfidSettings, rfidMonthDates } from '../shared/work-rfid.mjs';
const monthValid = value => typeof value === 'string' && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
const document = row => ({ version: Number(row?.version ?? 0), settings: row ? JSON.parse(row.payload).settings : emptyRfidSettings(), records: row ? JSON.parse(row.payload).records : {} });
export function createRfidStore(transaction) {
  return {
    rfidMonth(month) {
      if (!monthValid(month)) throw workError(400, '조회 월을 확인해 주세요.');
      return transaction(async q => {
        const people = (await q(`SELECT id,name,operational_name,service_start_date,service_end_date,enabled FROM recipients WHERE ${recipientNotDeleted()} ORDER BY name,id`, [])).rows;
        const docs = (await q('SELECT * FROM work_rfid_months WHERE month=$1', [month])).rows;
        const selection = (await q('SELECT recipient_ids FROM recipient_service_months WHERE month=$1', [month])).rows[0];
        const selected = new Set(selection ? JSON.parse(selection.recipient_ids) : []);
        return { month, rows: people.filter(p => p.enabled || docs.some(d => d.recipient_id === p.id)).map(p => ({ id: p.id, name: p.name, operationalName: p.operational_name || '', serviceStartDate: p.service_start_date || '', serviceEndDate: p.service_end_date || '', enabled: Boolean(p.enabled), selected: selected.has(p.id), document: document(docs.find(d => d.recipient_id === p.id)) })) };
      });
    },
    saveRfid(month, body, current) {
      if (!monthValid(month) || !body || typeof body.recipientId !== 'string' || !Number.isInteger(body.version) || body.version < 0 || !['settings', 'day'].includes(body.kind)) throw workError(400, 'RFID 저장 내용을 확인해 주세요.');
      const dates = rfidMonthDates(month);
      if (body.kind === 'settings') {
        const s = body.settings;
        if (!s || !['weekdays', 'monSat', 'custom'].includes(s.pattern) || !Array.isArray(s.dates) || s.dates.length > 31 || s.dates.some(d => !dates.includes(d)) || typeof s.notes !== 'string' || s.notes.length > 5000 || !(s.totalDays === null || Number.isInteger(s.totalDays) && s.totalDays >= 0 && s.totalDays <= dates.length) || !(s.totalHours === null || typeof s.totalHours === 'number' && Number.isFinite(s.totalHours) && s.totalHours >= 0 && s.totalHours <= dates.length * 24)) throw workError(400, '총 근무일·시간과 근무 유형을 확인해 주세요.');
      } else if (!dates.includes(body.date) || typeof body.checked !== 'boolean' || typeof body.note !== 'string' || body.note.length > 5000) throw workError(400, '체크 날짜와 비고를 확인해 주세요.');
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (body.kind === 'day' && body.checked && body.date > today) throw workError(400, '미래 날짜는 확인 완료로 저장할 수 없습니다.');
      return transaction(async q => {
        if (!(await q(`SELECT id FROM recipients WHERE id=$1 AND ${recipientNotDeleted()}`, [body.recipientId])).rows.length) throw workError(404, '수급자를 찾을 수 없습니다.');
        const now = new Date().toISOString();
        await q('INSERT INTO work_rfid_months(month,recipient_id,payload,version,updated_by,updated_at) VALUES($1,$2,$3,0,$4,$5) ON CONFLICT(month,recipient_id) DO NOTHING RETURNING month', [month, body.recipientId, JSON.stringify({ settings: emptyRfidSettings(), records: {} }), current.me.id, now]);
        const old = (await q(`SELECT * FROM work_rfid_months WHERE month=$1 AND recipient_id=$2${q.forUpdate ?? ''}`, [month, body.recipientId])).rows[0];
        if (Number(old.version) !== body.version) throw workError(409, '다른 화면에서 RFID 내역이 변경되었습니다. 입력은 유지됩니다. 최신 내역을 불러온 뒤 다시 확인해 주세요.');
        const payload = document(old);
        if (body.kind === 'settings') payload.settings = { totalDays: body.settings.totalDays, totalHours: body.settings.totalHours, pattern: body.settings.pattern, dates: [...new Set(body.settings.dates)].sort(), notes: body.settings.notes.trim() };
        else payload.records[body.date] = { checked: body.checked, note: body.note.trim(), updatedBy: current.me.id, updatedAt: now };
        const saved = (await q('UPDATE work_rfid_months SET payload=$1,version=version+1,updated_by=$2,updated_at=$3 WHERE month=$4 AND recipient_id=$5 AND version=$6 RETURNING *', [JSON.stringify({ settings: payload.settings, records: payload.records }), current.me.id, now, month, body.recipientId, body.version])).rows[0];
        if (!saved) throw workError(409, 'RFID 내역이 변경되었습니다. 최신 내역을 불러와 주세요.');
        return { month, recipientId: body.recipientId, document: document(saved) };
      });
    }
  };
}
