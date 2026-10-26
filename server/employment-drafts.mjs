export const prepareEmploymentBody = (body, existing = null) => {
  const isDraft = body.isDraft ?? existing?.isDraft ?? false;
  if (typeof isDraft !== "boolean") throw new Error("근로계약 등록 상태를 확인하세요.");
  const result = { ...body, isDraft };
  if (isDraft) {
    for (const field of ["workerBirthDate", "residentRegistrationNumber", "primaryBank", "bankAccountNumber", "workerAddress",
      "jobTitle", "employmentType", "workplace", "contractStartDate", "contractEndDate", "workDays", "workStartTime", "workEndTime", "paymentDate", "insuranceStatus"]) result[field] ??= "";
    result.wageType ??= "시급";
    result.wageAmount ??= 0;
    result.breakMinutes ??= 0;
  }
  for (const field of ["contractStartDate", "contractEndDate"]) {
    const value = result[field];
    if (value && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error("계약 날짜를 YYYY-MM-DD 형식으로 확인하세요.");
  }
  return result;
};

export const prepareEmploymentDraftRows = (body) => {
  if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 100) throw new Error("한 번에 1~100건을 저장할 수 있습니다.");
  const ids = new Set();
  return body.rows.map((row, index) => {
    if (!row || typeof row.id !== "string" || !row.id.trim() || ids.has(row.id)) throw new Error(`${index + 1}행: 행 식별자를 확인하세요.`);
    ids.add(row.id);
    return { id: row.id, workerName: row.workerName, residentRegistrationNumber: row.residentRegistrationNumber ?? "",
      workerPhone: row.workerPhone ?? "", primaryBank: row.primaryBank ?? "", bankAccountNumber: row.bankAccountNumber ?? "",
      contractStartDate: row.contractStartDate ?? "", contractEndDate: row.contractEndDate ?? "",
      isDraft: true, enabled: true, contractTerms: [], recipientAssignments: [], insuranceSnapshots: [] };
  });
};

export const sameEmploymentDraft = (existing, input) => existing.isDraft &&
  ["workerName", "residentRegistrationNumber", "workerPhone", "primaryBank", "bankAccountNumber", "contractStartDate", "contractEndDate"].every((key) =>
    (existing[key] ?? "") === (input[key] ?? ""));
