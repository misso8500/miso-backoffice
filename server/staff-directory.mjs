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
    start, end, status, personnel, reporting, reportingDate: date(body.reportingDate), documents, memo: field(body.memo, 2000) };
}

const unpack = row => ({ ...JSON.parse(row.payload), version: Number(row.version), updatedAt: row.updated_at });

export function createStaffDirectoryStore(transaction) {
  return {
    staffDirectory() {
      return transaction(async q => ({ profiles: (await q('SELECT * FROM staff_directory_profiles ORDER BY updated_at DESC', [])).rows.map(unpack) }));
    },
    saveStaffProfile(body, current) {
      const profile = normalize(body);
      return transaction(async q => {
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
      });
    }
  };
}
