import type { EmploymentContract } from "../types";

export const getWorkerKey = (contract: EmploymentContract) => {
  const number = contract.residentRegistrationNumber.replace(/\D/g, "");
  return number.length === 13 ? number : contract.id;
};

export const compareEmploymentContracts = (a: EmploymentContract, b: EmploymentContract) =>
  b.contractStartDate.localeCompare(a.contractStartDate) ||
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

export const groupEmploymentContracts = (contracts: EmploymentContract[]) => {
  const groups = new Map<string, EmploymentContract[]>();
  for (const contract of [...contracts].sort(compareEmploymentContracts)) {
    const key = getWorkerKey(contract);
    const group = groups.get(key) ?? [];
    group.push(contract);
    groups.set(key, group);
  }
  return [...groups.values()];
};

export const formatEmploymentPeriod = (contract: Pick<EmploymentContract, "contractStartDate" | "contractEndDate">) =>
  `${contract.contractStartDate.replace(/-/g, "")}~${contract.contractEndDate?.replace(/-/g, "") || "종료일 미등록"}`;

export const isValidEmploymentPeriod = (start: string, end: string) => {
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  return isDate(start) && isDate(end) && start <= end;
};

export const getEmploymentCurrentYear = (now = new Date()) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric" }).format(now));

export const getEmploymentContractStatus = (
  contract: Pick<EmploymentContract, "enabled" | "contractStartDate" | "contractEndDate">,
  currentYear = getEmploymentCurrentYear()
) => {
  if (!contract.enabled) return { valid: false, label: "비활성화" };
  // Legacy contracts without an end date belong only to their recorded start year.
  const end = contract.contractEndDate || `${contract.contractStartDate.slice(0, 4)}-12-31`;
  if (!isValidEmploymentPeriod(contract.contractStartDate, end)) {
    return { valid: false, label: "계약기간 확인 필요" };
  }
  if (contract.contractStartDate <= `${currentYear}-12-31` && end >= `${currentYear}-01-01`) {
    return { valid: true, label: "유효함" };
  }
  const startYear = contract.contractStartDate.slice(0, 4);
  const endYear = end.slice(0, 4);
  return { valid: false, label: `계약종료/${startYear === endYear ? startYear : `${startYear}~${endYear}`}년도 건` };
};
