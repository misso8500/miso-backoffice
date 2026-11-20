import type { EmploymentContract, EmploymentWorkCondition } from '../types';
import { requestJson } from '../storage';
import { getWorkerKey, groupEmploymentContracts } from './employment-contracts';

export const staffDocumentTypes = {
  contract: '연도별 근로계약서',
  health: '채용 건강검진',
  criminal: '범죄경력 회보서',
  certificate: '요양보호사 자격증'
} as const;
export type StaffDocument = { id: string; type: keyof typeof staffDocumentTypes; year: string; url: string; pages: number | null };
export type StaffProfile = {
  id: string; version: number; updatedAt?: string; anchorContractId: string;
  name: string; birth: string; phone: string; job: string; start: string; end: string; status: string;
  personnel: string; reporting: string; reportingDate: string; documents: StaffDocument[]; memo: string;
};
export const newStaffProfile = (contract?: EmploymentContract): StaffProfile => ({
  id: crypto.randomUUID(), version: 0, anchorContractId: contract?.id ?? '',
  name: contract?.workerName ?? '', birth: contract?.workerBirthDate ?? '', phone: contract?.workerPhone ?? '',
  job: contract?.jobTitle ?? '', start: '', end: '', status: '', personnel: '', reporting: '', reportingDate: '', documents: [], memo: ''
});
export const loadStaffProfiles = () => requestJson<{ profiles: StaffProfile[] }>('/api/work/staff-directory', { cache: 'reload' });
export const saveStaffProfile = (value: StaffProfile) =>
  requestJson<StaffProfile>('/api/work/staff-directory', { method: 'PUT', body: JSON.stringify(value) });

export function staffDirectoryEntries(profiles: StaffProfile[], contracts: EmploymentContract[]) {
  const byId = new Map(contracts.map(contract => [contract.id, contract]));
  const byWorker = new Map(groupEmploymentContracts(contracts).map(group => [getWorkerKey(group[0]), group]));
  const linkedIds = new Set(profiles.map(profile => profile.anchorContractId));
  const claimed = new Set<string>();
  const entries: { key: string; profile?: StaffProfile; contracts: EmploymentContract[]; name: string }[] = profiles.map(profile => {
    const anchor = byId.get(profile.anchorContractId);
    const group = anchor ? (byWorker.get(getWorkerKey(anchor)) ?? []).filter(contract => contract.id === anchor.id || !linkedIds.has(contract.id)) : [];
    const assigned = group.filter(contract => !claimed.has(contract.id));
    for (const contract of assigned) claimed.add(contract.id);
    return { key: profile.id, profile, contracts: assigned, name: profile.name };
  });
  for (const group of byWorker.values()) {
    const remaining = group.filter(contract => !claimed.has(contract.id));
    if (remaining.length) entries.push({ key: remaining[0].id, profile: undefined, contracts: remaining, name: remaining[0].workerName });
  }
  return entries.sort((first, second) => first.name.localeCompare(second.name, 'ko'));
}

export function conditionOverlapsMonth(contract: EmploymentContract, condition: EmploymentWorkCondition, month: string,
  service?: { serviceStartDate: string; serviceEndDate: string }) {
  if (!contract.enabled || contract.isDraft || !condition.recipientId || condition.matchingStatus === 'pending') return false;
  if (!contract.contractStartDate || !condition.effectiveStartDate || !condition.effectiveEndDate) return false;
  const start = [month + '-01', contract.contractStartDate, condition.effectiveStartDate, service?.serviceStartDate || ''].sort().at(-1)!;
  const end = [month + '-31', contract.contractEndDate, condition.effectiveEndDate, service?.serviceEndDate].filter(Boolean).sort()[0]!;
  return start <= end && (condition.matchingStatus === 'active' || condition.statusDate > start);
}
