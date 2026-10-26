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
  `${contract.contractStartDate ? contract.contractStartDate.replace(/-/g, "") : "시작일 미등록"}~${contract.contractEndDate?.replace(/-/g, "") || "종료일 미등록"}`;

export const isValidEmploymentPeriod = (start: string, end: string) => {
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  return isDate(start) && isDate(end) && start <= end;
};

export const getEmploymentCurrentYear = (now = new Date()) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric" }).format(now));

export const getEmploymentToday = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export const getMatchingSummary = (contract: Pick<EmploymentContract, "workConditions">, today = getEmploymentToday()) => {
  if (!contract.workConditions) return { count: 0, label: "매칭 정보 확인 필요", review: "기존 계약의 수급자·근무 조건을 확인해 주세요." };
  const conditions = contract.workConditions.conditions;
  const active = conditions.filter((condition) => condition.recipientId && condition.matchingStatus !== "pending" &&
    condition.effectiveStartDate <= today && condition.effectiveEndDate >= today &&
    (condition.matchingStatus === "active" || condition.statusDate > today));
  const count = new Set(active.map((condition) => condition.recipientId)).size;
  const label = count ? `매칭 ${count}명` : conditions.some((condition) => condition.recipientId && condition.matchingStatus !== "pending" && condition.effectiveStartDate > today)
    ? "근무 예정" : conditions.some((condition) => condition.matchingStatus === "paused") ? "서비스 일시정지"
    : conditions.some((condition) => condition.matchingStatus === "ended") ? "서비스 종료"
    : conditions.some((condition) => condition.recipientId && condition.matchingStatus !== "pending" && condition.effectiveEndDate < today)
      ? "서비스 기간 종료" : "매칭 대기";
  return { count, label, review: count >= 2 ? "복수 수급자 매칭 · 합산 근무시간 및 보험 가입 검토 필요"
    : conditions.some((condition) => ["paused", "ended"].includes(condition.matchingStatus))
      ? "서비스 중단·종료 이력 · 보험 변경 검토 필요" : "연령·겸직·근무시간에 따른 보험 적용 별도 확인" };
};

export const getEmploymentContractStatus = (
  contract: Pick<EmploymentContract, "enabled" | "contractStartDate" | "contractEndDate" | "workConditions" | "isDraft">,
  currentYear = getEmploymentCurrentYear()
) => {
  if (!contract.enabled) return { valid: false, label: "비활성화" };
  if (contract.isDraft) return { valid: false, label: "정보 입력 중" };
  // Legacy contracts without an end date belong only to their recorded start year.
  const end = contract.contractEndDate || `${contract.contractStartDate.slice(0, 4)}-12-31`;
  if (!isValidEmploymentPeriod(contract.contractStartDate, end)) {
    return { valid: false, label: "계약기간 확인 필요" };
  }
  if (contract.contractStartDate <= `${currentYear}-12-31` && end >= `${currentYear}-01-01`) {
    if (contract.workConditions) {
      const matching = getMatchingSummary(contract);
      if (!matching.count) return { valid: false, label: matching.label };
    }
    return { valid: true, label: "유효함" };
  }
  const startYear = contract.contractStartDate.slice(0, 4);
  const endYear = end.slice(0, 4);
  return { valid: false, label: `계약종료/${startYear === endYear ? startYear : `${startYear}~${endYear}`}년도 건` };
};
