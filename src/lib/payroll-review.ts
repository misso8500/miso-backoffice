import { careGroup, payrollBirth, reviewWorkRows, type WorkRow } from './payroll-work';
import { insuranceNames } from './payroll';
import type { EmploymentContract, Recipient } from '../types';

export const allowanceNames = ['주휴수당', '장기근속장려금', '보수교육비', '연차수당', '중증 수급자 가산', '차량·동행수당', '비과세 식대', '기타 수당', '근로자의 날 수당'] as const;
export type Allowance = { mode: '' | 'none' | 'fixed' | 'count'; amount: number | null; count: number | null; rate: number | null };
export type Review = {
  workerKey: string;
  basis: string;
  rates: Record<string, { base: number | null; holiday: number | null }>;
  allowances: Allowance[];
  insurance: { status: string; amount: number | null }[];
  copays: Record<string, { status: string; amount: number | null }>;
  incomeTax: number | null; localTax: number | null;
};

export const blankReview = (workerKey: string): Review => ({
  workerKey, basis: '', rates: {}, allowances: allowanceNames.map(() => ({ mode: '', amount: null, count: null, rate: null })),
  insurance: insuranceNames.map(() => ({ status: '', amount: null })), copays: {}, incomeTax: null, localTax: null
});

const workerKey = (row: WorkRow) => JSON.stringify([row.worker.normalize('NFC').replace(/\s/g, ''), payrollBirth(row.birth)]);
const recipientKey = (row: WorkRow) => JSON.stringify(row.fixed ? [row.contractId, true] : [row.contractId, row.recipientId, careGroup(row.care), false]);
const fingerprint = (value: unknown) => {
  let hash = 2166136261;
  for (const character of JSON.stringify(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
};

export function reviewWorkers(rows: WorkRow[], month: string, contracts: EmploymentContract[], recipients: Recipient[]) {
  const { reviewed } = reviewWorkRows(rows, month, contracts, recipients);
  const workers = new Map<string, { key: string; name: string; birth: string; rows: WorkRow[]; pending: number }>();
  for (const { row, issue } of reviewed) {
    if (!row.worker || !row.birth) continue;
    const key = workerKey(row);
    const worker = workers.get(key) ?? { key, name: row.worker, birth: row.birth, rows: [], pending: 0 };
    if (issue) worker.pending++;
    else worker.rows.push(row);
    workers.set(key, worker);
  }
  return [...workers.values()].map(worker => {
    const assignments = new Map<string, WorkRow[]>();
    const family = new Map<string, WorkRow[]>();
    for (const row of worker.rows) {
      const key = recipientKey(row);
      assignments.set(key, [...(assignments.get(key) ?? []), row]);
      if (careGroup(row.care) === '가족') family.set(row.recipientId, [...(family.get(row.recipientId) ?? []), row]);
    }
    const groups = [...assignments].map(([key, rows]) => {
      const first = rows[0];
      const contract = contracts.find(item => item.id === first.contractId);
      const mode = first.fixed ? '월급' : '시급';
      const termIds = new Set(contract?.workConditions?.conditions.filter(condition =>
        condition.recipientId === first.recipientId && rows.some(row =>
          (!condition.effectiveStartDate || (row.date || month + '-31') >= condition.effectiveStartDate) &&
          (!condition.effectiveEndDate || (row.date || month + '-01') <= condition.effectiveEndDate))).map(item => item.termId));
      const terms = contract?.contractTerms.filter(term => term.wageType === mode && (!termIds.size || termIds.has(term.id ?? ''))) ?? [];
      const suggested = terms.length === 1 ? terms[0].wageAmount :
        !contract?.contractTerms.length && contract?.wageType === mode ? contract.wageAmount : null;
      return { key, rows, contract, fixed: first.fixed, care: first.care, recipient: first.recipient, suggested,
        minutes: rows.reduce((sum, row) => sum + (row.minutes ?? 0) + (row.source ? 0 : row.holiday ?? 0), 0),
        holiday: rows.reduce((sum, row) => sum + (row.holiday ?? 0), 0) };
    });
    return { ...worker, groups, family,
      basis: fingerprint([worker.rows, worker.pending, groups.map(group => group.contract?.updatedAt)]) };
  });
}

export const allowanceAmount = (item: Allowance) => item.mode === 'count' ? (item.count ?? 0) * (item.rate ?? 0)
  : item.mode === 'fixed' ? item.amount ?? 0 : 0;

export function reviewTotals(worker: ReturnType<typeof reviewWorkers>[number], review: Review) {
  let base = 0, holiday = 0;
  const fixedContracts = new Set<string>();
  for (const group of worker.groups) {
    const rates = review.rates[group.key];
    if (group.fixed) {
      const contractId = group.rows[0].contractId;
      if (!fixedContracts.has(contractId)) base += rates?.base ?? 0;
      fixedContracts.add(contractId);
    } else base += Math.round(group.minutes * (rates?.base ?? 0) / 60);
    holiday += Math.round(group.holiday * (rates?.holiday ?? 0) / 60);
  }
  const allowances = review.allowances.reduce((sum, item) => sum + allowanceAmount(item), 0);
  const insurer = review.insurance.reduce((sum, item, index) => sum + (index === 4 || item.status !== '가입' ? 0 : item.amount ?? 0), 0);
  const copay = [...worker.family.keys()].reduce((sum, id) => sum +
    (review.copays[id]?.status === '공제' ? review.copays[id].amount ?? 0 : 0), 0);
  const deductions = insurer + (review.incomeTax ?? 0) + (review.localTax ?? 0);
  const gross = base + holiday + allowances;
  const net = gross - deductions - copay;
  const complete = worker.groups.length > 0 && !worker.pending && net >= 0 &&
    worker.groups.every(group => review.rates[group.key]?.base != null && (!group.holiday || review.rates[group.key]?.holiday != null)) &&
    review.allowances.every(item => item.mode === 'none' || (item.mode === 'fixed' && item.amount != null) ||
      (item.mode === 'count' && item.count != null && item.rate != null)) &&
    review.insurance.every((item, index) => item.status && (index === 4 || item.status !== '가입' || item.amount != null)) &&
    [...worker.family.keys()].every(id => review.copays[id]?.status === '미공제' ||
      (review.copays[id]?.status === '공제' && review.copays[id].amount != null)) &&
    review.incomeTax != null && review.localTax != null;
  return { base, holiday, allowances, gross, deductions, copay, net, complete };
}
