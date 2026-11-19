import { workError } from './work-tasks.mjs';

const invalid = message => { throw workError(400, message); };
const money = value => {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 9999999999)) invalid('금액을 원 단위의 0 이상 정수로 입력해 주세요.');
  return value;
};
const string = (value, limit = 200) => {
  if (typeof value !== 'string' || value.length > limit) invalid('입력 형식이나 길이를 확인해 주세요.');
  return value.trim();
};
const array = (value, limit) => {
  if (!Array.isArray(value) || value.length > limit) invalid('입력 행 수를 확인해 주세요.');
  return value;
};

function normalizeEntries(month, entries) {
  const contracts = new Set();
  return array(entries, 1000).map(entry => {
    const contractId = string(entry?.contractId);
    if (!contractId || contracts.has(contractId)) invalid('근로계약서별로 한 행만 작성해 주세요.');
    contracts.add(contractId);
    const days = new Set();
    const shifts = array(entry.shifts, 1000).map(shift => {
      const date = string(shift?.date, 10);
      const recipientId = string(shift?.recipientId);
      const regular = money(shift?.regular), holiday = money(shift?.holiday);
      const key = JSON.stringify([date, recipientId]);
      if (!date.startsWith(month + '-') || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date || !recipientId || !(regular || holiday) ||
          regular === null || holiday === null || regular + holiday > 1440 || days.has(key)) {
        invalid('수급자별 근무일, 일반·휴일 근무시간 및 중복 입력을 확인해 주세요.');
      }
      const start = string(shift.start ?? '', 5);
      const end = string(shift.end ?? '', 5);
      const breakMinutes = money(shift.breakMinutes ?? 0);
      const note = string(shift.note ?? '', 500);
      const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
      if (start || end || breakMinutes) {
        if (!timePattern.test(start) || !timePattern.test(end) ||
            (minutes(end) - minutes(start) + 1440) % 1440 - breakMinutes !== regular + holiday) {
          invalid(`${date} 출퇴근 시각에서 휴게시간을 뺀 시간과 일반·휴일 근무시간 합계가 같아야 합니다.`);
        }
      }
      days.add(key);
      return { date, recipientId, regular, holiday, rate: money(shift.rate), ...(start ? { start, end, breakMinutes } : {}), ...(note ? { note } : {}) };
    });
    const insurance = array(entry.insurance, 5);
    if (insurance.length !== 5) invalid('사회보험 항목을 확인해 주세요.');
    if (!['', '시급', '월급', '혼합'].includes(entry.mode)) invalid('임금형태를 확인해 주세요.');
    return {
      contractId, type: string(entry.type, 100), mode: string(entry.mode, 10),
      base: money(entry.base), holidayRate: money(entry.holidayRate), deductions: money(entry.deductions),
      shifts,
      allowances: array(entry.allowances, 40).map(item => {
        const name = string(item?.name, 100);
        if (!name) invalid('특수 수당명을 입력해 주세요.');
        return { name, amount: money(item.amount) };
      }),
      insurance: insurance.map(item => {
        if (!['', '가입', '미가입', '해당 없음'].includes(item?.status)) invalid('사회보험 가입상태를 확인해 주세요.');
        return { status: item.status, amount: money(item.amount) };
      }),
      insuranceMemo: string(entry.insuranceMemo, 500)
    };
  });
}

function normalizeWorkRows(month, rows) {
  const ids = new Set();
  return array(rows, 5000).map(row => {
    const id = string(row?.id, 80);
    const date = string(row.date, 10);
    const birth = string(row.birth, 20);
    const minutes = money(row.minutes), holiday = money(row.holiday);
    if (!id || ids.has(id) || typeof row.fixed !== 'boolean' ||
        (date && (!date.startsWith(month + '-') || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date ||
          (minutes ?? 0) + (holiday ?? 0) > 1440)) ||
        (row.fixed && (date || minutes !== null))) invalid('근무일, 일반·휴일 근무시간, 고정급 구분을 확인해 주세요.');
    ids.add(id);
    const inputs = row.inputs;
    const fields = ['expected', 'visits', 'laborDay', 'vehicle', 'extra', 'longevity', 'intensive', 'copay'];
    if (inputs && (fields.some(key => inputs[key] !== null && (!Number.isFinite(inputs[key]) || inputs[key] < 0 || inputs[key] > 9999999999)) ||
        ![null, true, false].includes(inputs.fullAttendance))) invalid('급여마법사 참고 항목을 확인해 주세요.');
    return { id, date, birth, worker: string(row.worker), recipient: string(row.recipient), care: string(row.care),
      minutes, holiday, fixed: row.fixed, recipientId: string(row.recipientId), contractId: string(row.contractId), source: string(row.source),
      ...(inputs ? { inputs: { ...Object.fromEntries(fields.map(key => [key, inputs[key]])), fullAttendance: inputs.fullAttendance } } : {}) };
  });
}

function normalizeReviews(reviews) {
  const keys = new Set();
  const record = (value, transform) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 5000) {
      invalid('급여 검토 항목을 확인해 주세요.');
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [string(key, 700), transform(item)]));
  };
  return array(reviews, 5000).map(review => {
    const workerKey = string(review?.workerKey, 500);
    if (!workerKey || keys.has(workerKey)) invalid('근로자 검토 행을 확인해 주세요.');
    keys.add(workerKey);
    const allowances = array(review.allowances, 9);
    const insurance = array(review.insurance, 5);
    if (allowances.length !== 9 || insurance.length !== 5) invalid('수당과 사회보험 항목을 확인해 주세요.');
    return {
      workerKey, basis: string(review.basis, 10000),
      rates: record(review.rates, item => ({ base: money(item?.base), holiday: money(item?.holiday) })),
      allowances: allowances.map(item => {
        if (!['', 'none', 'fixed', 'count'].includes(item?.mode)) invalid('수당 지급 방식을 확인해 주세요.');
        return { mode: item.mode, amount: money(item.amount), count: money(item.count), rate: money(item.rate) };
      }),
      insurance: insurance.map(item => {
        if (!['', '가입', '미가입', '해당 없음'].includes(item?.status)) invalid('사회보험 가입상태를 확인해 주세요.');
        return { status: item.status, amount: money(item.amount) };
      }),
      copays: record(review.copays, item => {
        if (!['', '공제', '미공제'].includes(item?.status)) invalid('본인부담금 공제 여부를 확인해 주세요.');
        return { status: item.status, amount: money(item.amount) };
      }),
      incomeTax: money(review.incomeTax), localTax: money(review.localTax)
    };
  });
}

export function createPayrollStore(transaction) {
  function checkMonth(month) {
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month ?? '')) invalid('조회 연월을 확인해 주세요.');
  }
  const unpack = row => {
    if (!row) return { version: 0, entries: [], workRows: [], reviews: [], updatedAt: null };
    const payload = JSON.parse(row.payload);
    return { version: Number(row.version), updatedAt: row.updated_at,
      entries: Array.isArray(payload) ? payload : payload.entries, workRows: payload.workRows ?? [], reviews: payload.reviews ?? [] };
  };
  return {
    payrollMonth(month) {
      checkMonth(month);
      return transaction(async q => unpack((await q('SELECT * FROM payroll_months WHERE month=$1', [month])).rows[0]));
    },
    savePayrollMonth(month, body, current) {
      checkMonth(month);
      if (!Number.isSafeInteger(body?.version) || body.version < 0) invalid('급여대장의 조회 버전을 확인해 주세요.');
      const entries = normalizeEntries(month, body.entries);
      const reviews = body.reviews === undefined ? null : normalizeReviews(body.reviews);
      const workRows = body.workRows === undefined ? null : normalizeWorkRows(month, body.workRows);
      return transaction(async q => {
        const dates = new Set();
        const recipients = new Set();
        const daily = new Map();
        for (const entry of entries) {
          const contract = (await q('SELECT is_draft, resident_registration_number, contract_start_date, contract_end_date FROM employment_contracts WHERE id=$1', [entry.contractId])).rows[0];
          if (!contract || contract.is_draft || !contract.contract_start_date || contract.contract_start_date > month + '-31' || (contract.contract_end_date && contract.contract_end_date < month + '-01')) invalid('해당 월의 근로계약서를 확인해 주세요.');
          const worker = String(contract.resident_registration_number ?? '').replace(/\D/g, '');
          const workerKey = worker.length === 13 ? worker : entry.contractId;
          for (const shift of entry.shifts) {
            if (shift.date < contract.contract_start_date || (contract.contract_end_date && shift.date > contract.contract_end_date)) invalid('계약 기간에 포함되는 근무일을 입력해 주세요.');
            const key = JSON.stringify([workerKey, shift.date, shift.recipientId]);
            if (dates.has(key)) invalid('같은 요양보호사·수급자·근무일이 여러 계약에 입력되었습니다.');
            dates.add(key);
            recipients.add(shift.recipientId);
            const day = JSON.stringify([workerKey, shift.date]);
            const minutes = (daily.get(day) ?? 0) + shift.regular + shift.holiday;
            if (minutes > 1440) invalid('요양보호사의 하루 근무시간은 1,440분을 넘을 수 없습니다.');
            daily.set(day, minutes);
          }
        }
        for (const id of recipients) {
          if (!(await q('SELECT id FROM recipients WHERE id=$1', [id])).rowCount) invalid('등록된 수급자를 선택해 주세요.');
        }
        const previous = (workRows === null || reviews === null) && body.version > 0
          ? unpack((await q('SELECT * FROM payroll_months WHERE month=$1 AND version=$2', [month, body.version])).rows[0]) : null;
        const now = new Date().toISOString();
        const values = [month, JSON.stringify({ entries, workRows: workRows ?? previous?.workRows ?? [], reviews: reviews ?? previous?.reviews ?? [] }), current.me.id, now, body.version];
        const saved = body.version === 0
          ? await q('INSERT INTO payroll_months(month,version,payload,updated_by,updated_at) VALUES($1,1,$2,$3,$4) ON CONFLICT(month) DO NOTHING RETURNING *', values.slice(0, 4))
          : await q('UPDATE payroll_months SET payload=$2,updated_by=$3,updated_at=$4,version=version+1 WHERE month=$1 AND version=$5 RETURNING *', values);
        if (!saved.rowCount) throw workError(409, '다른 사용자가 이 달의 급여대장을 변경했습니다. 최신 자료를 확인해 주세요.');
        return unpack(saved.rows[0]);
      });
    }
  };
}
