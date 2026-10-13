const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const amount = (value, label, { max = Number.MAX_SAFE_INTEGER, integer = false } = {}) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max ||
      (integer && !Number.isInteger(value))) throw new Error(`${label}을(를) 확인하세요.`);
  return value;
};
const text = (value, max = 2000) => {
  if (typeof value !== "string" || value.length > max) throw new Error("근무 조건의 입력값을 확인하세요.");
  return value.trim();
};

export const normalizeWorkConditions = (input, contract, existing = null) => {
  if (input === undefined) return existing?.workConditions;
  if (!input || !Array.isArray(input.conditions) || input.conditions.length !== contract.contractTerms.length ||
      input.conditions.length === 0 || input.conditions.length > 50) throw new Error("수급자별 계약 조건을 확인하세요.");
  const monthlyTravelAllowance = amount(input.monthlyTravelAllowance, "월정액 교통비", { integer: true });
  const termIds = new Set();
  const conditions = input.conditions.map((item, index) => {
    const term = contract.contractTerms[index];
    if (!item || item.termId !== term.id || termIds.has(item.termId)) throw new Error("계약 조건 식별자가 일치하지 않습니다.");
    termIds.add(item.termId);
    if (!["pending", "active", "paused", "ended"].includes(item.matchingStatus)) throw new Error("매칭 상태를 확인하세요.");
    const recipientId = text(item.recipientId, 200);
    if (item.matchingStatus !== "pending" && !recipientId) throw new Error("매칭된 수급자를 선택하세요.");
    const serviceType = text(item.serviceType, 100);
    if (!serviceType || typeof item.familyCare !== "boolean") throw new Error("서비스 형태와 가족요양 여부를 확인하세요.");
    const start = item.effectiveStartDate;
    const end = item.effectiveEndDate;
    if (!validDate(start) || !validDate(end) || start > end || start < contract.contractStartDate ||
        (contract.contractEndDate && end > contract.contractEndDate)) throw new Error("조건 적용 기간은 계약 기간 안에 입력하세요.");
    const statusDate = text(item.statusDate, 10);
    if ((["paused", "ended"].includes(item.matchingStatus) && !statusDate) ||
        (statusDate && (!validDate(statusDate) || statusDate < start || statusDate > end))) throw new Error("중단·종료일은 조건 적용 기간 안에 입력하세요.");
    const workDays = text(item.workDays, 100);
    const workStartTime = text(item.workStartTime, 5);
    const workEndTime = text(item.workEndTime, 5);
    const isTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!workDays || !isTime(workStartTime) || !isTime(workEndTime) || workStartTime >= workEndTime) throw new Error("근무 요일과 시작·종료 시간을 확인하세요.");
    const breakMinutes = amount(item.breakMinutes, "휴게 시간");
    const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    if (breakMinutes >= minutes(workEndTime) - minutes(workStartTime)) throw new Error("휴게 시간은 근무 시간보다 짧아야 합니다.");
    const monthlyHourLimit = amount(item.monthlyHourLimit, "월 약정 최대 시간", { max: 744 });
    if (monthlyHourLimit === 0) throw new Error("월 약정 최대 시간을 입력하세요.");
    if (!["confirmed", "needs_confirmation"].includes(item.documentStatus)) throw new Error("문서 확인 상태를 선택하세요.");
    return {
      termId: term.id, recipientId, serviceType, familyCare: item.familyCare,
      matchingStatus: item.matchingStatus, statusDate, effectiveStartDate: start, effectiveEndDate: end,
      workDays, workStartTime, workEndTime, breakMinutes, monthlyHourLimit,
      vehicleSupportPerVisit: amount(item.vehicleSupportPerVisit, "차량동행 1회 약정액", { integer: true }),
      changeReason: text(item.changeReason), documentStatus: item.documentStatus
    };
  });
  // Two conditions for the same recipient may describe successive periods, never overlapping periods.
  for (let i = 0; i < conditions.length; i++) for (let j = i + 1; j < conditions.length; j++) {
    const a = conditions[i], b = conditions[j];
    if (a.recipientId && a.recipientId === b.recipientId &&
        a.effectiveStartDate <= b.effectiveEndDate && b.effectiveStartDate <= a.effectiveEndDate) {
      throw new Error("같은 수급자의 조건 적용 기간이 겹칩니다. 이전 조건 종료일을 먼저 조정하세요.");
    }
  }
  const history = existing?.workConditions?.history ?? [];
  const withoutIds = (terms) => terms.map(({ id, ...rest }) => rest);
  const changed = existing && (JSON.stringify(existing.workConditions?.conditions ?? []) !== JSON.stringify(conditions) ||
    (existing.workConditions?.monthlyTravelAllowance ?? 0) !== monthlyTravelAllowance ||
    JSON.stringify(withoutIds(existing.contractTerms)) !== JSON.stringify(withoutIds(contract.contractTerms)));
  return {
    monthlyTravelAllowance, conditions,
    history: changed ? [...history, {
      changedAt: new Date().toISOString(), monthlyTravelAllowance: existing.workConditions?.monthlyTravelAllowance ?? 0,
      conditions: existing.workConditions?.conditions ?? [], contractTerms: existing.contractTerms
    }] : history
  };
};
