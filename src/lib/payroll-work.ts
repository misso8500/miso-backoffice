import type { EmploymentContract, Recipient } from '../types';

export type WorkRow = {
  id: string; date: string; worker: string; birth: string; recipient: string; care: string;
  minutes: number | null; holiday: number | null; fixed: boolean;
  recipientId: string; contractId: string; source: string;
  longevityEligible?: boolean | null;
  intensiveEligible?: boolean | null;
  inputs?: { expected: number | null; visits: number | null; laborDay: number | null; vehicle: number | null;
    extra: number | null; fullAttendance: boolean | null; longevity: number | null; intensive: number | null; copay: number | null };
};

export const blankWorkInputs = (): NonNullable<WorkRow['inputs']> => ({
  expected: null, visits: null, laborDay: null, vehicle: null, extra: null,
  fullAttendance: null, longevity: null, intensive: null, copay: null
});

export function coversWorkPeriod(start: string, end: string | undefined, period: string) {
  return (!start || start.slice(0, period.length) <= period) && (!end || end.slice(0, period.length) >= period);
}

export function contractWorkTypes(contract: EmploymentContract, row: WorkRow, month: string, recipient?: Recipient) {
  if (!recipient) return [];
  const conditions = contract.workConditions?.conditions.filter(item => item.recipientId === recipient.id) ?? [];
  const types = conditions.length
    ? conditions.filter(item => coversWorkPeriod(item.effectiveStartDate, item.effectiveEndDate, row.date || month))
        .map(item => item.serviceType || (item.familyCare ? '가족' : recipient.serviceType))
    : contract.recipientAssignments.some(item => item.recipientId === recipient.id) ? [recipient.serviceType] : [];
  return [...new Set(types.filter(Boolean))];
}

export const blankWorkRow = (): WorkRow => ({
  id: crypto.randomUUID(), date: '', worker: '', birth: '', recipient: '', care: '',
  minutes: null, holiday: null, fixed: false, recipientId: '', contractId: '', source: ''
});

const clean = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, '');
export const careGroup = (value: string) => clean(value).split('(')[0];
const workTypeKey = (value: string) => careGroup(value).replace(/^(방문|가족)요양$/, '$1');
export const sameWorkType = (first: string, second: string) => workTypeKey(first) === workTypeKey(second);
export function payrollBirth(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}` : value.trim();
}

export function workMatches(row: WorkRow, month: string, contracts: EmploymentContract[], recipients: Recipient[]) {
  const people = recipients.filter(person => [person.name, person.operationalName].some(name => name && clean(name) === clean(row.recipient)));
  const recipient = recipients.find(person => person.id === row.recipientId);
  const candidates = contracts.filter(contract => !contract.isDraft && contract.contractStartDate &&
    clean(contract.workerName) === clean(row.worker) && row.birth && payrollBirth(contract.workerBirthDate ?? '') === payrollBirth(row.birth) &&
    coversWorkPeriod(contract.contractStartDate, contract.contractEndDate, row.date || month));
  const linked = candidates.filter(contract => {
    if (!recipient) return false;
    const conditions = contract.workConditions?.conditions.filter(item => item.recipientId === recipient.id) ?? [];
    if (!conditions.length) return contract.recipientAssignments.some(item => item.recipientId === recipient.id);
    return conditions.some(item => (!item.serviceType || sameWorkType(item.serviceType, row.care)) &&
      coversWorkPeriod(item.effectiveStartDate, item.effectiveEndDate, row.date || month));
  });
  return { people, candidates, linked };
}

export function classifyWorkRow(row: WorkRow, month: string, contracts: EmploymentContract[], recipients: Recipient[]) {
  const { people } = workMatches(row, month, contracts, recipients);
  const recipientId = row.recipientId || (people.length === 1 ? people[0].id : '');
  const next = { ...row, recipientId };
  const { linked, candidates } = workMatches(next, month, contracts, recipients);
  const suggestions = row.fixed ? candidates.filter(contract => contract.wageType === '월급' || contract.contractTerms.some(term => term.wageType === '월급')) : linked;
  return { ...next, contractId: row.contractId || (suggestions.length === 1 ? suggestions[0].id : '') };
}

export function workKey(row: WorkRow) {
  return JSON.stringify([clean(row.worker), payrollBirth(row.birth), row.recipientId || clean(row.recipient), workTypeKey(row.care)]);
}

export async function readPayrollWizard(buffer: ArrayBuffer, month: string) {
  const { default: { Workbook } } = await import('exceljs');
  const book = new Workbook();
  await book.xlsx.load(buffer);
  const monthIn = (text: string) => {
    const match = /(\d{4})\s*년\s*(\d{1,2})\s*월/.exec(text);
    return match ? `${match[1]}-${match[2].padStart(2, '0')}` : '';
  };
  const sources = book.worksheets.filter(sheet => sheet.name !== '인쇄용' &&
    ['근로자 이름', '생년월일', '요양구분', '대상 수급자', '근무시간'].every((label, index) => sheet.getCell(3, index + 1).text.includes(label)));
  const sheet = sources.find(item => monthIn(item.name) === month) ?? (sources.length === 1 ? sources[0] : undefined);
  if (!sheet) throw new Error('귀속월에 해당하는 급여마법사 작업 시트를 찾을 수 없습니다.');
  const rows: WorkRow[] = [];
  sheet.eachRow((row, index) => {
    const value = (column: number) => {
      const cell = row.getCell(column);
      return cell.formula ? cell.result : cell.value;
    };
    const label = (column: number) => row.getCell(column).text.trim();
    const number = (column: number) => {
      const cell = value(column);
      return typeof cell === 'number' && Number.isFinite(cell) && cell >= 0 ? cell : null;
    };
    if (index < 4 || !label(1)) return;
    const birthday = value(2);
    const hours = number(5), holiday = number(8);
    rows.push({
      ...blankWorkRow(), worker: label(1), birth: birthday instanceof Date ? birthday.toISOString().slice(0, 10) : payrollBirth(label(2)),
      care: label(3), recipient: label(4) === '-' ? '' : label(4), fixed: hours === 999,
      minutes: hours === null || hours === 999 ? null : Math.round(hours * 60),
      holiday: holiday === null ? null : Math.round(holiday * 60), source: `${sheet.name}!${index}`,
      inputs: { expected: number(6), visits: number(7), laborDay: number(9), vehicle: number(10), extra: number(11),
        fullAttendance: typeof value(12) === 'boolean' ? value(12) as boolean : null, longevity: number(14), intensive: number(16), copay: number(29) }
    });
  });
  if (rows.length === 0 || rows.length > 5000) throw new Error('가져올 근무 행 수를 확인해 주세요.');
  return { rows, sheet: sheet.name, sheetMonth: monthIn(sheet.name), titleMonth: monthIn(sheet.getCell('A2').text) };
}

export function reviewWorkRows(rows: WorkRow[], month: string, contracts: EmploymentContract[], recipients: Recipient[]) {
  const groups = new Map<string, WorkRow[]>();
  const dates = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const key = workKey(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
    const counts = dates.get(key) ?? new Map<string, number>();
    counts.set(row.date, (counts.get(row.date) ?? 0) + 1);
    dates.set(key, counts);
  }
  const reviewed = rows.map(row => {
    const references = workMatches(row, month, contracts, recipients);
    const key = workKey(row);
    const counts = dates.get(key);
    const overlap = row.date ? counts?.has('') || (counts?.get(row.date) ?? 0) > 1 : (groups.get(key)?.length ?? 0) > 1;
    const issue = !row.worker || !row.birth ? '근로자 이름·생년월일 확인'
      : !row.care ? '요양구분 확인'
      : !row.fixed && !recipients.some(person => person.id === row.recipientId) ? '수급자 연결 필요'
      : !row.contractId || !references.candidates.some(item => item.id === row.contractId) ? '근로계약 연결 필요'
      : row.date && (!row.date.startsWith(month + '-') || (row.minutes ?? 0) + (row.holiday ?? 0) > 1440) ? '근무일·시간 확인'
      : !row.fixed && !(row.minutes || row.holiday) ? '근무시간 확인'
      : overlap ? '중복 범위 확인' : '';
    return { row, references, issue };
  });
  return { groups, reviewed };
}
