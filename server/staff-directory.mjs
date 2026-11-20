import { createHash, randomUUID } from 'node:crypto';
import { recurrenceToday } from '../shared/work-recurrence.mjs';
import { workError } from './work-tasks.mjs';

function invalid(message) { throw workError(400, message); }
function field(value, limit = 100) {
  if (typeof value !== 'string' || value.length > limit) invalid('직원 정보의 입력 형식이나 길이를 확인해 주세요.');
  return value.trim();
}
function date(value) {
  const text = field(value, 10);
  if (text && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) ||
    new Date(text).toISOString().slice(0, 10) !== text)) invalid('날짜를 확인해 주세요.');
  return text;
}
function normalize(body) {
  if (!body || !Number.isSafeInteger(body.version) || body.version < 0) invalid('직원 정보의 조회 버전을 확인해 주세요.');
  const id = field(body.id, 80);
  const anchorContractId = field(body.anchorContractId, 100);
  const name = field(body.name);
  const birth = date(body.birth);
  const start = date(body.start), end = date(body.end);
  if (!id || !name || (start && end && end < start)) invalid('직원 이름과 입사·퇴사일을 확인해 주세요.');
  const personnel = field(body.personnel), reporting = field(body.reporting), status = field(body.status);
  if (![personnel, reporting].every(value => ['', '대기', '진행 중', '완료'].includes(value)) ||
      !['', '재직', '휴직', '퇴사', '입사 예정'].includes(status)) invalid('재직·희망이음 진행 상태를 확인해 주세요.');
  if (!Array.isArray(body.documents) || body.documents.length > 100) invalid('서류 목록을 확인해 주세요.');
  const ids = new Set();
  const documents = body.documents.map(item => {
    const id = field(item?.id, 80), type = field(item?.type), year = field(item?.year, 4);
    const url = field(item?.url, 2000), pages = item?.pages;
    if (!id || ids.has(id) || !['contract','health','criminal','certificate'].includes(type) ||
      (type === 'contract' ? !/^[1-9]\d{3}$/.test(year) : Boolean(year)) ||
      (pages !== null && (!Number.isInteger(pages) || pages < 1 || pages > 500))) invalid('서류 종류, 계약 연도와 페이지 수를 확인해 주세요.');
    if (url) {
      let parsed;
      try { parsed = new URL(url); } catch { invalid('Google Drive 서류 링크를 확인해 주세요.'); }
      if (parsed.protocol !== 'https:' || !['drive.google.com','docs.google.com'].includes(parsed.hostname) ||
        parsed.username || parsed.password || parsed.port) invalid('Google Drive 서류 링크를 확인해 주세요.');
    }
    ids.add(id);
    return { id, type, year, url, pages };
  });
  return { id, anchorContractId, name, birth, phone: field(body.phone), job: field(body.job),
    ...(body.hopeStaffNumber ? { hopeStaffNumber: field(body.hopeStaffNumber, 80) } : {}),
    ...(body.hopeReportStatus ? { hopeReportStatus: field(body.hopeReportStatus, 80) } : {}),
    start, end, status, personnel, reporting, reportingDate: date(body.reportingDate), documents, memo: field(body.memo, 2000) };
}

const unpack = row => ({ ...JSON.parse(row.payload), version: Number(row.version), updatedAt: row.updated_at });

const importFields = ['phone', 'job', 'start', 'end', 'status', 'reporting', 'reportingDate', 'hopeStaffNumber', 'hopeReportStatus'];
const importLabels = { phone: '연락처', job: '직종', start: '입사일', end: '퇴사일', status: '재직 상태', reporting: '입사보고', reportingDate: '입사보고일', hopeStaffNumber: '희망이음 직원번호', hopeReportStatus: '희망이음 보고상태' };
const identityName = value => (value ?? '').normalize('NFC').replace(/\s+/g, '');
const identity = (name, birth) => JSON.stringify([identityName(name), birth]);
const workerKey = row => {
  const number = (row.resident_registration_number ?? '').replace(/\D/g, '');
  return number.length === 13 ? number : row.id;
};

function readImportRows(body) {
  if (!Array.isArray(body?.rows) || !body.rows.length || body.rows.length > 3000) invalid('가져올 직원 행 수를 확인해 주세요.');
  const rowNumbers = new Set();
  return body.rows.map(item => {
    const row = item?.row;
    if (!Number.isSafeInteger(row) || row < 1 || row > 1048576 || rowNumbers.has(row)) invalid('엑셀 행 번호를 확인해 주세요.');
    rowNumbers.add(row);
    const input = { row, issue: field(item.issue, 200), effectiveDate: date(item.effectiveDate ?? '') };
    const data = { id: 'preview', version: 0, anchorContractId: '', ...Object.fromEntries(
      ['name', 'birth', ...importFields].map(key => [key, item[key]])), personnel: '', memo: '', documents: [] };
    if (input.issue && data.start && data.end && data.start > data.end) data.end = '';
    return { ...input, ...normalize(data) };
  });
}

function confirmations(body, rows) {
  const values = body.confirmed ?? [];
  const valid = new Set(rows.map(row => row.row));
  if (!Array.isArray(values) || values.length > rows.length || !values.every(row => valid.has(row))) invalid('연결할 직원 행을 확인해 주세요.');
  return new Set(values);
}

async function importPlan(q, rows, confirmed) {
  const profiles = (await q('SELECT * FROM staff_directory_profiles', [])).rows.map(unpack);
  const contracts = (await q(`SELECT id,worker_name,worker_birth_date,worker_phone,job_title,resident_registration_number
    FROM employment_contracts ORDER BY contract_start_date DESC,created_at DESC,id DESC`, [])).rows;
  const byId = new Map(contracts.map(row => [row.id, row]));
  const claimed = new Set();
  const records = [];
  for (const profile of profiles) {
    const anchor = byId.get(profile.anchorContractId);
    if (anchor) claimed.add(workerKey(anchor));
    records.push({ name: profile.name, birth: profile.birth || anchor?.worker_birth_date || '', profile });
  }
  for (const contract of contracts) {
    const key = workerKey(contract);
    if (claimed.has(key)) continue;
    claimed.add(key);
    records.push({ name: contract.worker_name, birth: contract.worker_birth_date || '', contract });
  }
  const index = new Map();
  for (const record of records) {
    const name = identityName(record.name);
    const matches = index.get(name) ?? [];
    matches.push(record);
    index.set(name, matches);
  }
  const byHopeNumber = new Map();
  for (const record of records) {
    if (record.profile?.hopeStaffNumber) {
      const key = record.profile.hopeStaffNumber;
      const candidates = byHopeNumber.get(key) ?? [];
      candidates.push(record);
      byHopeNumber.set(key, candidates);
    }
  }
  const groups = new Map();
  const importKey = row => row.hopeStaffNumber ? 'hope:' + row.hopeStaffNumber : identity(row.name, row.birth);
  const sourceRank = row => [row.start, row.end ? '0' : '1', row.end, row.effectiveDate].join('|');
  for (const row of rows) {
    const key = importKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) group.sort((a, b) => sourceRank(b).localeCompare(sourceRank(a)) || a.row - b.row);
  const today = recurrenceToday();
  const used = new Set();
  return rows.map(row => {
    const summary = { row: row.row, name: row.name };
    const review = note => ({ ...summary, action: 'review', note });
    if (row.issue || (!row.birth && !row.hopeStaffNumber)) return review(row.issue || '직원번호 또는 생년월일 확인 필요');
    const group = groups.get(importKey(row));
    const latest = group[0];
    const signature = item => JSON.stringify(importFields.map(key => item[key]));
    if (group.some(item => identityName(item.name) !== identityName(row.name) ||
      (sourceRank(item) === sourceRank(latest) && (item.issue || signature(item) !== signature(latest))))) {
      return review('같은 직원의 엑셀 행에 서로 다른 정보가 있습니다.');
    }
    if (row !== latest) return { ...summary, action: 'duplicate', note: `${latest.row}행의 직원 정보로 반영합니다.` };
    const candidates = index.get(identityName(row.name)) ?? [];
    const numbered = row.hopeStaffNumber ? (byHopeNumber.get(row.hopeStaffNumber) ?? []) : [];
    if (numbered.length > 1 || numbered.some(item => identityName(item.name) !== identityName(row.name))) {
      return review('직원번호에 연결된 기존 직원을 확인해 주세요.');
    }
    const sameName = candidates.filter(item => !item.profile?.hopeStaffNumber || item.profile.hopeStaffNumber === row.hopeStaffNumber);
    const matches = row.birth ? sameName.filter(item => item.birth === row.birth) : sameName;
    if (!numbered.length && (matches.length > 1 || (row.birth && sameName.some(item => !item.birth)))) {
      return review('같은 이름의 기존 직원 또는 계약을 확인해 주세요.');
    }
    const match = numbered[0] ?? matches[0];
    if (!numbered.length && !match && candidates.length && (!row.birth || candidates.some(item => item.birth === row.birth))) {
      return review('같은 이름에 다른 직원번호가 등록되어 있습니다.');
    }
    if (match && !numbered.length && !row.birth && !confirmed.has(row.row)) {
      const details = [match.birth, match.profile?.job || match.contract?.job_title].filter(Boolean).join(' · ');
      const note = details ? `기존 명부 ${details}. 같은 직원인지 확인해 주세요.` : '이름이 같은 기존 직원과 연결할지 확인해 주세요.';
      return { ...review(note), confirmName: true };
    }
    const target = match?.profile?.id ?? match?.contract?.id;
    if (target && used.has(target)) return review('앞 행에서 이미 같은 기존 직원과 연결합니다.');
    if (target) used.add(target);
    const contract = match?.contract;
    const old = match?.profile ?? {
      id: '', version: 0, anchorContractId: contract?.id ?? '', name: contract?.worker_name || row.name,
      birth: contract?.worker_birth_date || row.birth, phone: contract?.worker_phone || '', job: contract?.job_title || '',
      start: '', end: '', status: '', personnel: '', reporting: '', reportingDate: '', documents: [], memo: ''
    };
    const patch = Object.fromEntries(importFields.filter(key => row[key]).map(key => [key, row[key]]));
    if (row.hopeStaffNumber && !row.end && old.end && row.start > old.end) patch.end = '';
    const start = patch.start ?? old.start;
    const end = patch.end ?? old.end;
    if (!patch.status && (row.start || row.end) && (old.status !== '휴직' || row.end)) {
      patch.status = end && end <= today ? '퇴사' : start > today ? '입사 예정' : '재직';
    }
    if (!patch.reporting && row.reportingDate) patch.reporting = '완료';
    const { updatedAt, ...existing } = old;
    const value = { ...existing, ...patch, birth: old.birth || row.birth };
    if (value.start && value.end && value.end < value.start) return review('기존 직원의 입·퇴사일과 엑셀 날짜를 확인해 주세요.');
    const changed = importFields.filter(key => value[key] !== old[key]);
    const action = match?.profile ? (changed.length || old.birth !== value.birth ? 'update' : 'unchanged') : contract ? 'connect' : 'create';
    const note = action === 'unchanged' ? '이미 같은 내용입니다.' :
      [...changed.map(key => importLabels[key]), ...(!old.birth && value.birth ? ['생년월일'] : [])].join(', ');
    return { ...summary, action, note, value };
  });
}

const preview = plan => ({
  token: createHash('sha256').update(JSON.stringify(plan)).digest('hex'),
  rows: plan.map(({ value, ...row }) => row)
});

async function writeProfile(q, body, current) {
  const profile = normalize(body);
  if (profile.anchorContractId && !(await q('SELECT id FROM employment_contracts WHERE id=$1', [profile.anchorContractId])).rows.length) {
    invalid('연결할 근로계약을 확인해 주세요.');
  }
  if (profile.anchorContractId && (await q('SELECT id FROM staff_directory_profiles WHERE anchor_contract_id=$1 AND id<>$2',
    [profile.anchorContractId, profile.id])).rows.length) throw workError(409, '이미 다른 직원에게 연결된 근로계약입니다.');
  const values = [profile.id, profile.anchorContractId || null, JSON.stringify(profile), current.me.id, new Date().toISOString(), body.version];
  const result = body.version === 0
    ? await q('INSERT INTO staff_directory_profiles(id,anchor_contract_id,payload,version,updated_by,updated_at) VALUES($1,$2,$3,1,$4,$5) ON CONFLICT DO NOTHING RETURNING *', values.slice(0,5))
    : await q('UPDATE staff_directory_profiles SET anchor_contract_id=$2,payload=$3,updated_by=$4,updated_at=$5,version=version+1 WHERE id=$1 AND version=$6 RETURNING *', values);
  if (!result.rows.length) throw workError(409, '직원 정보가 변경되었습니다. 최신 명부를 확인해 주세요.');
  return unpack(result.rows[0]);
}

export function createStaffDirectoryStore(transaction) {
  return {
    staffDirectory() {
      return transaction(async q => ({ profiles: (await q('SELECT * FROM staff_directory_profiles ORDER BY updated_at DESC', [])).rows.map(unpack) }));
    },
    saveStaffProfile(body, current) {
      return transaction(q => writeProfile(q, body, current));
    },
    previewStaffImport(body) {
      const rows = readImportRows(body);
      return transaction(async q => preview(await importPlan(q, rows, confirmations(body, rows))));
    },
    applyStaffImport(body, current) {
      const rows = readImportRows(body);
      return transaction(async q => {
        if (q.forUpdate) await q('LOCK TABLE staff_directory_profiles IN SHARE ROW EXCLUSIVE MODE', []);
        const plan = await importPlan(q, rows, confirmations(body, rows));
        if (preview(plan).token !== body.token) throw workError(409, '직원 명부가 변경되었습니다. 미리보기를 다시 확인해 주세요.');
        const counts = { created: 0, connected: 0, updated: 0 };
        for (const item of plan) {
          if (!['create', 'connect', 'update'].includes(item.action)) continue;
          await writeProfile(q, { ...item.value, id: item.value.id || randomUUID() }, current);
          if (item.action === 'create') counts.created++;
          else if (item.action === 'connect') counts.connected++;
          else counts.updated++;
        }
        return counts;
      });
    }
  };
}
