import type { Review } from './payroll-review';
import type { WorkRow } from './payroll-work';

export const insuranceNames = ['국민연금', '건강보험', '장기요양보험', '고용보험', '산재보험'] as const;

export type Shift = { date: string; recipientId: string; regular: number; holiday: number; rate: number | null; start?: string; end?: string; breakMinutes?: number; note?: string };
export type Entry = {
  contractId: string; type: string; mode: string; base: number | null; holidayRate: number | null;
  deductions: number | null; shifts: Shift[]; allowances: { name: string; amount: number | null }[];
  insurance: { status: string; amount: number | null }[]; insuranceMemo: string;
};
export type PayrollMonth = { version: number; entries: Entry[]; workRows?: WorkRow[]; reviews?: Review[]; updatedAt: string | null };

export function calculatePayroll(entry: Entry) {
  const regular = entry.shifts.reduce((total, shift) => total + shift.regular, 0);
  const holiday = entry.shifts.reduce((total, shift) => total + shift.holiday, 0);
  const hourly = entry.mode !== '월급';
  const monthly = entry.mode !== '시급';
  const monthlyBase = monthly ? entry.base ?? 0 : 0;
  let regularUnits = 0;
  let holidayUnits = 0;
  const shiftAmounts = entry.shifts.map(shift => {
    const priorRegular = Math.round(regularUnits / 60);
    const priorHoliday = Math.round(holidayUnits / 60);
    regularUnits += hourly ? shift.regular * (shift.rate ?? 0) : 0;
    holidayUnits += shift.holiday * (entry.holidayRate ?? 0);
    return { regularPay: Math.round(regularUnits / 60) - priorRegular, holidayPay: Math.round(holidayUnits / 60) - priorHoliday };
  });
  const hourlyBase = Math.round(regularUnits / 60);
  const base = monthlyBase + hourlyBase;
  const holidayPay = Math.round(holidayUnits / 60);
  const allowances = entry.allowances.reduce((total, item) => total + (item.amount ?? 0), 0);
  const insurance = entry.insurance.reduce((total, item) => total + (item.amount ?? 0), 0);
  const gross = base + holidayPay + allowances;
  const deductions = insurance + (entry.deductions ?? 0);
  const complete = Boolean(entry.type && ['시급', '월급', '혼합'].includes(entry.mode) &&
    (!monthly || entry.base !== null) && (!hourly || entry.shifts.length > 0 &&
      entry.shifts.every(shift => shift.regular === 0 || shift.rate !== null)) &&
    (!holiday || entry.holidayRate !== null) && entry.insurance.every(item => item.status && item.amount !== null) &&
    entry.allowances.every(item => item.name && item.amount !== null) && gross >= deductions);
  return { regular, holiday, base, monthlyBase, hourlyBase, shiftAmounts, holidayPay, allowances, insurance, gross, deductions, net: gross - deductions, complete };
}

export function shiftMinutes(start: string, end: string, breakMinutes: number) {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return (minutes(end) - minutes(start) + 1440) % 1440 - breakMinutes;
}
