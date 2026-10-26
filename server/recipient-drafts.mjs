export const draftNumberPrefix = "__draft__:";
export const visibleCareNumber = (number) => number?.startsWith(draftNumberPrefix) ? "" : number;

export const prepareRecipientBody = (body, existing = null) => {
  const isDraft = body.isDraft ?? existing?.isDraft ?? false;
  if (typeof isDraft !== "boolean") throw new Error("수급자 등록 상태를 확인하세요.");
  const result = { ...body, isDraft };
  const number = body.longTermCareNumber ?? "";
  if (typeof number !== "string" || number.startsWith(draftNumberPrefix)) throw new Error("장기요양인정번호를 확인하세요.");
  if (isDraft) {
    for (const field of ["birthDate", "longTermCareNumber", "careGrade", "address", "representativeName", "representativeRelation",
      "representativePhone", "serviceStartDate", "serviceEndDate", "contractRegisteredDate", "contractExpiredDate"]) {
      result[field] = body[field] ?? "";
    }
    if (!number.trim()) result.longTermCareNumber = `${draftNumberPrefix}${body.id ?? existing?.id}`;
  }
  for (const key of ["birthDate", "serviceStartDate", "serviceEndDate", "contractRegisteredDate", "contractExpiredDate"]) {
    const value = result[key];
    if (value && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error(`${key}: 날짜를 YYYY-MM-DD 형식으로 확인하세요.`);
  }
  return result;
};

export const prepareDraftRows = (body) => {
  if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 100) throw new Error("한 번에 1~100명을 저장할 수 있습니다.");
  const ids = new Set(), numbers = new Set();
  return body.rows.map((row, index) => {
    if (!row || typeof row.id !== "string" || !row.id.trim() || ids.has(row.id)) throw new Error(`${index + 1}행: 행 식별자를 확인하세요.`);
    ids.add(row.id);
    const number = typeof row.longTermCareNumber === "string" ? row.longTermCareNumber.trim() : "";
    if (number && numbers.has(number)) throw new Error(`${index + 1}행: 인정번호가 다른 행과 중복됩니다.`);
    if (number) numbers.add(number);
    const grade = typeof row.careGrade === "string" ? row.careGrade.trim() : "";
    if (grade && !["1등급", "2등급", "3등급", "4등급", "5등급", "인지지원등급"].includes(grade)) throw new Error(`${index + 1}행: 등급을 확인하세요.`);
    return { id: row.id, name: row.name, birthDate: row.birthDate ?? "", longTermCareNumber: number,
      careGrade: grade, phone: row.phone ?? "", address: row.address ?? "",
      isDraft: true, enabled: true, serviceType: "방문", reductionType: "일반" };
  });
};

export const sameDraft = (existing, input) => existing.isDraft &&
  ["name", "birthDate", "longTermCareNumber", "careGrade", "phone", "address"].every((key) =>
    (key === "longTermCareNumber" ? visibleCareNumber(existing[key]) : existing[key] ?? "") ===
    (key === "longTermCareNumber" ? visibleCareNumber(input[key]) : input[key] ?? ""));
