import { prepareServicePeriod } from "../service-period.mjs";
import { randomUUID } from "node:crypto";
import { handleRecipientDocuments } from "../recipient-documents.mjs";
import { DriveError } from "../drive.mjs";
import { handleDriveRequest } from "../drive.mjs";
import { prepareEmploymentBody, prepareEmploymentDraftRows, sameEmploymentDraft } from "../employment-drafts.mjs";
import { prepareRecipientBody, prepareDraftRows, sameDraft, visibleCareNumber } from "../recipient-drafts.mjs";
import { normalizeWorkConditions } from "../work-conditions.mjs";
import { AuthError, handleAuthRequest } from "../auth.mjs";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnv } from "../load-env.mjs";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");
const port = Number(process.env.PORT ?? 5174);

loadEnv(rootDir);

if (!process.env.DATABASE_URL) {
  throw new Error("Supabase DATABASE_URL 환경 변수를 설정하세요.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX ?? (process.env.VERCEL ? 1 : 5)),
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  ssl:
    process.env.PGSSLMODE === "require" || process.env.DATABASE_URL?.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined
});

await pool.query(readFileSync(join(__dirname, "schema.sql"), "utf8"));

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
};

const readBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
};

const parsePath = (url) => {
  const parsed = new URL(url, `http://127.0.0.1:${port}`);
  return parsed.pathname.split("/").filter(Boolean);
};

const assertString = (value, field, { optional = false } = {}) => {
  if (optional && (value === undefined || value === null || value === "")) {
    return null;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
};

const assertNumber = (value, field, { min = 0 } = {}) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < min) {
    throw new Error(`${field} must be a number greater than or equal to ${min}`);
  }

  return Math.round(numericValue);
};

const assertBoolean = (value, field) => {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be checked`);
  }

  return value;
};

const deriveBirthDateFromResidentNumber = (residentRegistrationNumber) => {
  const digits =
    typeof residentRegistrationNumber === "string"
      ? residentRegistrationNumber.replace(/\D/g, "")
      : "";

  if (digits.length < 7) {
    return null;
  }

  const yearPart = Number(digits.slice(0, 2));
  const monthPart = Number(digits.slice(2, 4));
  const dayPart = Number(digits.slice(4, 6));
  const centuryCode = digits[6];
  const century =
    centuryCode === "9" || centuryCode === "0"
      ? 1800
      : ["1", "2", "5", "6"].includes(centuryCode)
        ? 1900
        : ["3", "4", "7", "8"].includes(centuryCode)
          ? 2000
          : null;

  if (!century) {
    return null;
  }

  const birthDate = new Date(century + yearPart, monthPart - 1, dayPart);

  if (
    birthDate.getFullYear() !== century + yearPart ||
    birthDate.getMonth() !== monthPart - 1 ||
    birthDate.getDate() !== dayPart
  ) {
    return null;
  }

  return [
    birthDate.getFullYear(),
    String(birthDate.getMonth() + 1).padStart(2, "0"),
    String(birthDate.getDate()).padStart(2, "0")
  ].join("-");
};

const recipientFromRow = (row) => ({
  id: row.id,
  name: row.name,
  ...(row.operational_name ? { operationalName: row.operational_name } : {}),
  ...(row.assigned_backoffice_user_id ? { assignedBackofficeUserId: row.assigned_backoffice_user_id } : {}),
  birthDate: row.birth_date,
  isDraft: row.is_draft === true,
  longTermCareNumber: visibleCareNumber(row.long_term_care_number),
  careGrade: row.care_grade,
  ...(row.phone ? { phone: row.phone } : {}),
  address: row.address,
  representativeName: row.representative_name,
  representativeRelation: row.representative_relation,
  representativePhone: row.representative_phone,
  serviceType: row.service_type ?? "방문",
  caregiverRequirements: row.caregiver_requirements ?? "",
  reductionType: row.reduction_type ?? "일반",
  relatedPeople: row.related_people ?? "",
  medicalHistory: row.medical_history ?? "",
  serviceStartDate: row.service_start_date,
  serviceEndDate: row.service_end_date,
  contractRegisteredDate: row.contract_registered_date,
  contractExpiredDate: row.contract_expired_date,
  enabled: row.enabled !== false,
  recontractCount: Number(row.recontract_count ?? 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const employmentAssignmentsForContract = async (contractId) => {
  const { rows } = await pool.query(
    `
      SELECT
        recipients.id AS recipient_id,
        recipients.name AS recipient_name,
        recipients.care_grade,
        recipients.address
      FROM employment_contract_recipient_assignments
      JOIN recipients ON recipients.id = employment_contract_recipient_assignments.recipient_id
      WHERE employment_contract_id = $1
      ORDER BY recipients.name ASC
    `,
    [contractId]
  );

  return rows.map((row) => ({
    recipientId: row.recipient_id,
    recipientName: row.recipient_name,
    careGrade: row.care_grade,
    workplaceAddress: row.address
  }));
};

const insuranceSnapshotsForContract = async (contractId) => {
  const { rows } = await pool.query(
    `
      SELECT *
      FROM employment_insurance_snapshots
      WHERE employment_contract_id = $1
      ORDER BY effective_start_date DESC, created_at DESC
    `,
    [contractId]
  );

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    effectiveStartDate: row.effective_start_date,
    ...(row.effective_end_date ? { effectiveEndDate: row.effective_end_date } : {}),
    weeklyHours: Number(row.weekly_hours ?? 0),
    ...(row.memo ? { memo: row.memo } : {})
  }));
};

const contractTermsForContract = async (contractId, contractRow) => {
  const { rows } = await pool.query(
    `
      SELECT *
      FROM employment_contract_terms
      WHERE employment_contract_id = $1
      ORDER BY created_at ASC
    `,
    [contractId]
  );
  const terms = rows.map((row) => ({
    id: row.id,
    wageType: row.wage_type,
    wageAmount: Number(row.wage_amount ?? 0),
    nonTaxableMealAllowance: Number(row.non_taxable_meal_allowance ?? 0),
    nonTaxableVehicleAllowance: Number(row.non_taxable_vehicle_allowance ?? 0),
    otherNonTaxablePay: Number(row.other_non_taxable_pay ?? 0)
  }));

  if (terms.length > 0) {
    const order = contractRow.work_conditions?.conditions?.map((condition) => condition.termId) ?? [];
    if (order.length) terms.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return terms;
  }

  return [
    {
      id: `${contractId}-legacy-term`,
      wageType: contractRow.wage_type,
      wageAmount: Number(contractRow.wage_amount ?? 0),
      nonTaxableMealAllowance: Number(contractRow.non_taxable_meal_allowance ?? 0),
      nonTaxableVehicleAllowance: Number(contractRow.non_taxable_vehicle_allowance ?? 0),
      otherNonTaxablePay: Number(contractRow.taxable_extra_pay ?? 0)
    }
  ];
};

const employmentContractFromRow = async (row) => ({
  id: row.id,
  isDraft: row.is_draft === true,
  workerName: row.worker_name,
  workerBirthDate: row.worker_birth_date,
  residentRegistrationNumber: row.resident_registration_number,
  ...(row.worker_phone ? { workerPhone: row.worker_phone } : {}),
  primaryBank: row.primary_bank,
  bankAccountNumber: row.bank_account_number,
  workerAddress: row.worker_address,
  jobTitle: row.job_title,
  employmentType: row.employment_type,
  workplaceType: row.workplace_type === "recipient_home" ? "recipient_home" : "office",
  workplace: row.workplace,
  recipientAssignments: await employmentAssignmentsForContract(row.id),
  contractStartDate: row.contract_start_date,
  ...(row.contract_end_date ? { contractEndDate: row.contract_end_date } : {}),
  workDays: row.work_days,
  workStartTime: row.work_start_time,
  workEndTime: row.work_end_time,
  breakMinutes: Number(row.break_minutes ?? 0),
  wageType: row.wage_type,
  wageAmount: Number(row.wage_amount ?? 0),
  nonTaxableVehicleAllowance: Number(row.non_taxable_vehicle_allowance ?? 0),
  nonTaxableMealAllowance: Number(row.non_taxable_meal_allowance ?? 0),
  taxableExtraPay: Number(row.taxable_extra_pay ?? 0),
  ...(row.allowance_memo ? { allowanceMemo: row.allowance_memo } : {}),
  paymentDate: row.payment_date,
  insuranceStatus: row.insurance_status,
  insuranceSnapshots: await insuranceSnapshotsForContract(row.id),
  ...(row.work_conditions ? { workConditions: row.work_conditions } : {}),
  contractTerms: await contractTermsForContract(row.id, row),
  ...(row.memo ? { memo: row.memo } : {}),
  enabled: row.enabled !== false,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const readRecipient = async (recipientId) => {
  const { rows } = await pool.query(
    `
      SELECT
        recipients.*,
        (
          SELECT COUNT(*)
          FROM recipient_contract_events
          WHERE recipient_id = recipients.id AND type IN ('restored', 'recontracted')
        ) AS recontract_count
      FROM recipients
      WHERE id = $1
    `,
    [recipientId]
  );

  return rows[0] ? recipientFromRow(rows[0]) : null;
};

const normalizeRecipient = (body, existing = null) => {
  body = prepareRecipientBody(body, existing);
  const now = new Date().toISOString();
  const recipient = {
    isDraft: body.isDraft,
    id: assertString(body.id ?? existing?.id, "id"),
    name: assertString(body.name, "name"),
    operationalName: assertString(body.operationalName, "operationalName", { optional: true }),
    assignedBackofficeUserId: assertString(body.assignedBackofficeUserId, "assignedBackofficeUserId", { optional: true }),
    birthDate: assertString(body.birthDate, "birthDate", { optional: body.isDraft }) ?? "",
    longTermCareNumber: assertString(body.longTermCareNumber, "longTermCareNumber"),
    careGrade: assertString(body.careGrade, "careGrade", { optional: body.isDraft }) ?? "",
    phone: assertString(body.phone, "phone", { optional: true }),
    address: assertString(body.address, "address", { optional: body.isDraft }) ?? "",
    representativeName: assertString(body.representativeName, "representativeName", { optional: body.isDraft }) ?? "",
    representativeRelation: assertString(body.representativeRelation, "representativeRelation", { optional: body.isDraft }) ?? "",
    representativePhone: assertString(body.representativePhone, "representativePhone", { optional: body.isDraft }) ?? "",
    serviceType: assertString(body.serviceType ?? existing?.serviceType ?? "방문", "serviceType"),
    caregiverRequirements: assertString(body.caregiverRequirements ?? existing?.caregiverRequirements, "caregiverRequirements", { optional: true }) ?? "",
    reductionType: assertString(body.reductionType ?? existing?.reductionType ?? "일반", "reductionType"),
    relatedPeople: assertString(body.relatedPeople ?? existing?.relatedPeople, "relatedPeople", { optional: true }) ?? "",
    medicalHistory: assertString(body.medicalHistory ?? existing?.medicalHistory, "medicalHistory", { optional: true }) ?? "",
    serviceStartDate: assertString(body.serviceStartDate, "serviceStartDate", { optional: body.isDraft }) ?? "",
    serviceEndDate: assertString(body.serviceEndDate, "serviceEndDate", { optional: body.isDraft }) ?? "",
    contractRegisteredDate: assertString(body.contractRegisteredDate, "contractRegisteredDate", { optional: body.isDraft }) ?? "",
    contractExpiredDate: assertString(body.contractExpiredDate, "contractExpiredDate", { optional: body.isDraft }) ?? "",
    enabled: typeof body.enabled === "boolean" ? body.enabled : existing?.enabled ?? true,
    createdAt: existing?.createdAt ?? body.createdAt ?? now,
    updatedAt: now
  };

  if (recipient.serviceStartDate && recipient.serviceEndDate && recipient.serviceStartDate > recipient.serviceEndDate) {
    throw new Error("serviceStartDate must not be later than serviceEndDate");
  }

  if (recipient.contractRegisteredDate && recipient.contractExpiredDate && recipient.contractRegisteredDate > recipient.contractExpiredDate) {
    throw new Error("contractRegisteredDate must not be later than contractExpiredDate");
  }

  return recipient;
};

const normalizeEmploymentContract = (body, existing = null) => {
  body = prepareEmploymentBody(body, existing);
  if (existing && body.updatedAt && body.updatedAt !== existing.updatedAt) {
    throw Object.assign(new Error("다른 사용자가 이 계약을 수정했습니다. 최신 계약을 다시 열어 수정해 주세요."), { status: 409 });
  }
  const now = new Date().toISOString();
  const workplaceType = assertString(body.workplaceType ?? "office", "workplaceType");

  if (!["office", "recipient_home"].includes(workplaceType)) {
    throw new Error("workplaceType is invalid");
  }

  const recipientAssignments = Array.isArray(body.recipientAssignments)
    ? body.recipientAssignments.map((assignment) =>
        typeof assignment === "string"
          ? assignment
          : assertString(assignment.recipientId, "recipientId")
      )
    : [];
  const insuranceSnapshots = Array.isArray(body.insuranceSnapshots)
    ? body.insuranceSnapshots.map((snapshot) => ({
        id:
          typeof snapshot.id === "string" && snapshot.id.trim()
            ? snapshot.id.trim()
            : `insurance-snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status: assertString(snapshot.status, "insuranceSnapshot.status"),
        effectiveStartDate: assertString(snapshot.effectiveStartDate, "insuranceSnapshot.effectiveStartDate"),
        effectiveEndDate: assertString(snapshot.effectiveEndDate, "effectiveEndDate", {
          optional: true
        }),
        weeklyHours: assertNumber(snapshot.weeklyHours, "insuranceSnapshot.weeklyHours"),
        memo: assertString(snapshot.memo, "insuranceSnapshot.memo", { optional: true })
      }))
    : [];
  const contractTerms = Array.isArray(body.contractTerms)
    ? body.contractTerms.map((term) => ({
        id:
          typeof term.id === "string" && term.id.trim()
            ? term.id.trim()
            : `employment-term-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        wageType: assertString(term.wageType, "contractTerm.wageType"),
        wageAmount: assertNumber(term.wageAmount, "contractTerm.wageAmount", { min: body.isDraft ? 0 : 1 }),
        nonTaxableMealAllowance: assertNumber(
          term.nonTaxableMealAllowance ?? 0,
          "contractTerm.nonTaxableMealAllowance"
        ),
        nonTaxableVehicleAllowance: assertNumber(
          term.nonTaxableVehicleAllowance ?? 0,
          "contractTerm.nonTaxableVehicleAllowance"
        ),
        otherNonTaxablePay: assertNumber(term.otherNonTaxablePay ?? 0, "contractTerm.otherNonTaxablePay")
      }))
    : [];

  if (contractTerms.some((term) => !["월급", "시급"].includes(term.wageType))) {
    throw new Error("contractTerm.wageType is invalid");
  }

  const primaryTerm = contractTerms[0] ?? null;
  const residentRegistrationNumber = assertString(
    body.residentRegistrationNumber,
    "residentRegistrationNumber", { optional: body.isDraft }
  ) ?? "";
  const workerBirthDate =
    assertString(body.workerBirthDate, "workerBirthDate", { optional: true }) ??
    deriveBirthDateFromResidentNumber(residentRegistrationNumber);

  if (!workerBirthDate && (!body.isDraft || residentRegistrationNumber)) {
    throw new Error("residentRegistrationNumber is invalid");
  }

  const contract = {
    id: assertString(body.id ?? existing?.id, "id"),
    workerName: assertString(body.workerName, "workerName"),
    workerBirthDate: workerBirthDate ?? "",
    isDraft: body.isDraft,
    residentRegistrationNumber,
    workerPhone: assertString(body.workerPhone, "workerPhone", { optional: true }),
    primaryBank: assertString(body.primaryBank, "primaryBank", { optional: body.isDraft }) ?? "",
    bankAccountNumber: assertString(body.bankAccountNumber, "bankAccountNumber", { optional: body.isDraft }) ?? "",
    workerAddress: assertString(body.workerAddress, "workerAddress", { optional: body.isDraft }) ?? "",
    jobTitle: assertString(body.jobTitle, "jobTitle", { optional: body.isDraft }) ?? "",
    employmentType: assertString(body.employmentType, "employmentType", { optional: body.isDraft }) ?? "",
    workplaceType,
    workplace: assertString(body.workplace, "workplace", { optional: body.isDraft }) ?? "",
    recipientAssignments,
    contractStartDate: assertString(body.contractStartDate, "contractStartDate", { optional: body.isDraft }) ?? "",
    contractEndDate: assertString(body.contractEndDate, "contractEndDate", { optional: true }),
    workDays: assertString(body.workDays, "workDays", { optional: body.isDraft }) ?? "",
    workStartTime: assertString(body.workStartTime, "workStartTime", { optional: body.isDraft }) ?? "",
    workEndTime: assertString(body.workEndTime, "workEndTime", { optional: body.isDraft }) ?? "",
    breakMinutes: assertNumber(body.breakMinutes, "breakMinutes"),
    wageType: primaryTerm?.wageType ?? assertString(body.wageType, "wageType"),
    wageAmount: primaryTerm?.wageAmount ?? assertNumber(body.wageAmount, "wageAmount", { min: body.isDraft ? 0 : 1 }),
    nonTaxableVehicleAllowance:
      primaryTerm?.nonTaxableVehicleAllowance ??
      assertNumber(body.nonTaxableVehicleAllowance ?? 0, "nonTaxableVehicleAllowance"),
    nonTaxableMealAllowance:
      primaryTerm?.nonTaxableMealAllowance ??
      assertNumber(body.nonTaxableMealAllowance ?? 0, "nonTaxableMealAllowance"),
    taxableExtraPay:
      primaryTerm?.otherNonTaxablePay ?? assertNumber(body.taxableExtraPay ?? 0, "taxableExtraPay"),
    allowanceMemo: assertString(body.allowanceMemo, "allowanceMemo", { optional: true }),
    paymentDate: assertString(body.paymentDate, "paymentDate", { optional: body.isDraft }) ?? "",
    insuranceStatus: assertString(body.insuranceStatus, "insuranceStatus", { optional: body.isDraft }) ?? "",
    insuranceSnapshots,
    contractTerms,
    memo: assertString(body.memo, "memo", { optional: true }),
    enabled: typeof body.enabled === "boolean" ? body.enabled : existing?.enabled ?? true,
    createdAt: existing?.createdAt ?? body.createdAt ?? now,
    updatedAt: now
  };

  contract.workConditions = normalizeWorkConditions(body.workConditions, contract, existing);
  if (contract.workConditions) {
    contract.recipientAssignments = [...new Set(contract.workConditions.conditions.map((condition) => condition.recipientId).filter(Boolean))];
  }

  const isValidContractDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if ((!contract.isDraft && !isValidContractDate(contract.contractStartDate)) ||
      (contract.contractEndDate && !isValidContractDate(contract.contractEndDate)) ||
      (!contract.isDraft && (!existing || existing.isDraft) && !contract.contractEndDate)) {
    throw new Error("계약 시작일과 종료일을 YYYY-MM-DD 형식으로 입력하세요.");
  }

  if (contract.contractStartDate && contract.contractEndDate && contract.contractStartDate > contract.contractEndDate) {
    throw new Error("contractStartDate must not be later than contractEndDate");
  }

  if ((!contract.isDraft || (contract.workStartTime && contract.workEndTime)) && contract.workStartTime >= contract.workEndTime) {
    throw new Error("workStartTime must be earlier than workEndTime");
  }

  if (!contract.isDraft && contract.workplaceType === "recipient_home" && contract.recipientAssignments.length === 0) {
    throw new Error("recipientAssignments is required when workplaceType is recipient_home");
  }

  return contract;
};

const insertRecipient = async (recipient, executor = pool) =>
  executor.query(
    `
      INSERT INTO recipients (
        id, name, operational_name, assigned_backoffice_user_id, birth_date, long_term_care_number, care_grade, phone, address,
        representative_name, representative_relation, representative_phone,
        service_type, caregiver_requirements, reduction_type, related_people,
        service_start_date, service_end_date, contract_registered_date,
        contract_expired_date, enabled, created_at, updated_at, is_draft, medical_history
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
    `,
    [
      recipient.id,
      recipient.name,
      recipient.operationalName,
      recipient.assignedBackofficeUserId,
      recipient.birthDate,
      recipient.longTermCareNumber,
      recipient.careGrade,
      recipient.phone,
      recipient.address,
      recipient.representativeName,
      recipient.representativeRelation,
      recipient.representativePhone,
      recipient.serviceType,
      recipient.caregiverRequirements,
      recipient.reductionType,
      recipient.relatedPeople,
      recipient.serviceStartDate,
      recipient.serviceEndDate,
      recipient.contractRegisteredDate,
      recipient.contractExpiredDate,
      recipient.enabled,
      recipient.createdAt,
      recipient.updatedAt,
      recipient.isDraft ?? false,
      recipient.medicalHistory ?? ""
    ]
  );

const updateRecipient = async (recipient, executor = pool) =>
  executor.query(
    `
      UPDATE recipients SET
        name = $1, operational_name = $2, assigned_backoffice_user_id = $3, birth_date = $4, long_term_care_number = $5, care_grade = $6,
        phone = $7, address = $8, representative_name = $9, representative_relation = $10,
        representative_phone = $11, service_type = $12, caregiver_requirements = $13,
        reduction_type = $14, related_people = $15, service_start_date = $16, service_end_date = $17,
        contract_registered_date = $18, contract_expired_date = $19, enabled = $20, updated_at = $21, is_draft = $23, medical_history = $24
      WHERE id = $22
    `,
    [
      recipient.name,
      recipient.operationalName,
      recipient.assignedBackofficeUserId,
      recipient.birthDate,
      recipient.longTermCareNumber,
      recipient.careGrade,
      recipient.phone,
      recipient.address,
      recipient.representativeName,
      recipient.representativeRelation,
      recipient.representativePhone,
      recipient.serviceType,
      recipient.caregiverRequirements,
      recipient.reductionType,
      recipient.relatedPeople,
      recipient.serviceStartDate,
      recipient.serviceEndDate,
      recipient.contractRegisteredDate,
      recipient.contractExpiredDate,
      recipient.enabled,
      recipient.updatedAt,
      recipient.id,
      recipient.isDraft ?? false,
      recipient.medicalHistory ?? ""
    ]
  );

const insertEvent = async ({
  recipientId,
  type,
  documentsConfirmed = false,
  serviceStartDate = null,
  serviceEndDate = null,
  contractRegisteredDate = null,
  contractExpiredDate = null,
  memo = null
}) =>
  pool.query(
    `
      INSERT INTO recipient_contract_events (
        id, recipient_id, type, documents_confirmed, service_start_date, service_end_date,
        contract_registered_date, contract_expired_date, memo, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      `contract-event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      recipientId,
      type,
      documentsConfirmed,
      serviceStartDate,
      serviceEndDate,
      contractRegisteredDate,
      contractExpiredDate,
      memo,
      new Date().toISOString()
    ]
  );

const insertEmploymentContract = async (contract, executor = pool) =>
  executor.query(
    `
      INSERT INTO employment_contracts (
        id, worker_name, worker_birth_date, resident_registration_number, worker_phone,
        primary_bank, bank_account_number, worker_address, job_title,
        employment_type, workplace_type, workplace, contract_start_date, contract_end_date, work_days,
        work_start_time, work_end_time, break_minutes, wage_type, wage_amount,
        non_taxable_vehicle_allowance, non_taxable_meal_allowance, taxable_extra_pay,
        allowance_memo, payment_date, insurance_status, memo, enabled, created_at, updated_at, is_draft
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31
      )
    `,
    [
      contract.id,
      contract.workerName,
      contract.workerBirthDate,
      contract.residentRegistrationNumber,
      contract.workerPhone,
      contract.primaryBank,
      contract.bankAccountNumber,
      contract.workerAddress,
      contract.jobTitle,
      contract.employmentType,
      contract.workplaceType,
      contract.workplace,
      contract.contractStartDate,
      contract.contractEndDate,
      contract.workDays,
      contract.workStartTime,
      contract.workEndTime,
      contract.breakMinutes,
      contract.wageType,
      contract.wageAmount,
      contract.nonTaxableVehicleAllowance,
      contract.nonTaxableMealAllowance,
      contract.taxableExtraPay,
      contract.allowanceMemo,
      contract.paymentDate,
      contract.insuranceStatus,
      contract.memo,
      contract.enabled,
      contract.createdAt,
      contract.updatedAt,
      contract.isDraft ?? false
    ]
  );

const updateEmploymentContract = async (contract, executor = pool) =>
  executor.query(
    `
      UPDATE employment_contracts SET
        worker_name = $1, worker_birth_date = $2, resident_registration_number = $3,
        worker_phone = $4, primary_bank = $5, bank_account_number = $6, worker_address = $7,
        job_title = $8, employment_type = $9, workplace_type = $10, workplace = $11,
        contract_start_date = $12, contract_end_date = $13, work_days = $14,
        work_start_time = $15, work_end_time = $16, break_minutes = $17, wage_type = $18,
        wage_amount = $19, non_taxable_vehicle_allowance = $20,
        non_taxable_meal_allowance = $21, taxable_extra_pay = $22, allowance_memo = $23,
        payment_date = $24, insurance_status = $25, memo = $26, enabled = $27, updated_at = $28
      WHERE id = $29
    `,
    [
      contract.workerName,
      contract.workerBirthDate,
      contract.residentRegistrationNumber,
      contract.workerPhone,
      contract.primaryBank,
      contract.bankAccountNumber,
      contract.workerAddress,
      contract.jobTitle,
      contract.employmentType,
      contract.workplaceType,
      contract.workplace,
      contract.contractStartDate,
      contract.contractEndDate,
      contract.workDays,
      contract.workStartTime,
      contract.workEndTime,
      contract.breakMinutes,
      contract.wageType,
      contract.wageAmount,
      contract.nonTaxableVehicleAllowance,
      contract.nonTaxableMealAllowance,
      contract.taxableExtraPay,
      contract.allowanceMemo,
      contract.paymentDate,
      contract.insuranceStatus,
      contract.memo,
      contract.enabled,
      contract.updatedAt,
      contract.id
    ]
  );

const replaceEmploymentContractChildren = async (contract, executor = pool) => {
  await executor.query("UPDATE employment_contracts SET is_draft = $1 WHERE id = $2", [contract.isDraft ?? false, contract.id]);
  await executor.query("UPDATE employment_contracts SET work_conditions = $1 WHERE id = $2", [contract.workConditions ? JSON.stringify(contract.workConditions) : null, contract.id]);
  await executor.query("DELETE FROM employment_contract_recipient_assignments WHERE employment_contract_id = $1", [
    contract.id
  ]);
  await executor.query("DELETE FROM employment_insurance_snapshots WHERE employment_contract_id = $1", [
    contract.id
  ]);
  await executor.query("DELETE FROM employment_contract_terms WHERE employment_contract_id = $1", [
    contract.id
  ]);

  const now = new Date().toISOString();

  for (const recipientId of contract.recipientAssignments) {
    await executor.query(
      `
        INSERT INTO employment_contract_recipient_assignments (
          employment_contract_id, recipient_id, created_at
        ) VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `,
      [contract.id, recipientId, now]
    );
  }

  for (const snapshot of contract.insuranceSnapshots) {
    await executor.query(
      `
        INSERT INTO employment_insurance_snapshots (
          id, employment_contract_id, status, effective_start_date, effective_end_date,
          weekly_hours, memo, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        snapshot.id,
        contract.id,
        snapshot.status,
        snapshot.effectiveStartDate,
        snapshot.effectiveEndDate,
        snapshot.weeklyHours,
        snapshot.memo,
        now
      ]
    );
  }

  for (const term of contract.contractTerms) {
    await executor.query(
      `
        INSERT INTO employment_contract_terms (
          id, employment_contract_id, wage_type, wage_amount, non_taxable_meal_allowance,
          non_taxable_vehicle_allowance, other_non_taxable_pay, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        term.id,
        contract.id,
        term.wageType,
        term.wageAmount,
        term.nonTaxableMealAllowance,
        term.nonTaxableVehicleAllowance,
        term.otherNonTaxablePay,
        now
      ]
    );
  }
};

const saveEmploymentContract = async (contract, updating, expectedUpdatedAt) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (updating) {
      const { rows } = await client.query("SELECT updated_at FROM employment_contracts WHERE id = $1 FOR UPDATE", [contract.id]);
      if (rows[0]?.updated_at !== expectedUpdatedAt) throw Object.assign(new Error("다른 사용자가 이 계약을 수정했습니다. 최신 계약을 다시 열어 수정해 주세요."), { status: 409 });
      await updateEmploymentContract(contract, client);
    }
    else await insertEmploymentContract(contract, client);
    await replaceEmploymentContractChildren(contract, client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
};

const readEmploymentContractRow = async (contractId) => {
  const { rows } = await pool.query("SELECT * FROM employment_contracts WHERE id = $1", [contractId]);
  return rows[0] ?? null;
};

export const handlePostgresRequest = async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  try {
    const authentication = await handleAuthRequest(request, response, sendJson);
    if (authentication.handled) return;
    if (await handleDriveRequest(request, response, sendJson)) return;
    if (await handleRecipientDocuments(request, response, sendJson, {
      exists: async id => (await pool.query('SELECT 1 FROM recipients WHERE id=$1', [id])).rowCount > 0,
      get: async id => (await pool.query('SELECT payload FROM recipient_documents WHERE recipient_id=$1', [id])).rows[0]?.payload ?? null,
      save: async (id, payload, version) => {
        const result = version === null
          ? await pool.query('INSERT INTO recipient_documents(recipient_id,folder_id,payload,version) VALUES($1,$2,$3,$4) ON CONFLICT(recipient_id) DO NOTHING', [id,payload.folderId,JSON.stringify(payload),payload.version])
          : await pool.query('UPDATE recipient_documents SET folder_id=$2,payload=$3,version=$4 WHERE recipient_id=$1 AND version=$5', [id,payload.folderId,JSON.stringify(payload),payload.version,version]);
        if (!result.rowCount) throw new DriveError(409, '다른 사용자가 변경했습니다. 다시 불러와 주세요.');
      }
    })) return;
    const parts = parsePath(request.url ?? "/");
    if (parts[0] === 'api' && parts[1] === 'recipients' && parts[2] && parts[3] === 'service-period' && !parts[4] && request.method === 'PUT') {
      const body = await readBody(request), client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query('SELECT * FROM recipients WHERE id=$1 FOR UPDATE', [parts[2]]);
        if (!result.rows[0]) throw Object.assign(new Error('수급자를 찾을 수 없습니다.'), {status:404});
        const existing = recipientFromRow(result.rows[0]), change = prepareServicePeriod(body, existing);
        if (change.changed) {
          const now = new Date().toISOString();
          await client.query('UPDATE recipients SET service_start_date=$1,service_end_date=$2,contract_registered_date=$1,contract_expired_date=$2,updated_at=$3 WHERE id=$4', [change.start,change.end,now,parts[2]]);
          await client.query('INSERT INTO recipient_contract_events(id,recipient_id,type,service_start_date,service_end_date,memo,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(),parts[2],change.type,change.start,change.end,change.memo,now]);
        }
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      sendJson(response, 200, await readRecipient(parts[2])); return;
    }


    if (parts[0] === "api" && parts[1] === "health" && request.method === "GET") {
      const { rows } = await pool.query(
        "SELECT current_database() AS database, current_user AS \"user\", NOW() AS \"serverTime\""
      );
      sendJson(response, 200, { ok: true, provider: "supabase", ...rows[0] });
      return;
    }

    if (parts[0] === "api" && parts[1] === "backoffice-users") {
      const readState = async () => {
        const users = await pool.query("SELECT id, name, birth_date AS \"birthDate\", created_at AS \"createdAt\" FROM backoffice_users ORDER BY name ASC");
        const sessions = await pool.query(`
          SELECT s.device_id AS "deviceId", s.device_name AS "deviceName", s.user_id AS "userId",
                 u.name AS "userName", s.last_seen_at AS "lastSeenAt"
          FROM backoffice_sessions s JOIN backoffice_users u ON u.id = s.user_id
          WHERE s.last_seen_at >= $1
          ORDER BY s.last_seen_at DESC
        `, [new Date(Date.now() - 45000).toISOString()]);
        return { users: users.rows, sessions: sessions.rows };
      };

      if (!parts[2] && request.method === "GET") {
        sendJson(response, 200, await readState());
        return;
      }

      if (request.method !== "GET") {
        sendJson(response, 405, { error: "사용자 선택 기능은 구글 로그인으로 변경되었습니다." });
        return;
      }

      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (parts[0] !== "api" || !["recipients", "employment-contracts"].includes(parts[1])) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (parts[1] === "recipients" && parts[2] === "bulk-drafts" && request.method === "POST") {
      const rows = prepareDraftRows(await readBody(request)).map((row) => normalizeRecipient(row));
      const client = await pool.connect();
      const saved = [];
      try {
        await client.query("BEGIN");
        for (const [index, recipient] of rows.entries()) {
          const previous = await client.query("SELECT * FROM recipients WHERE id = $1", [recipient.id]);
          if (previous.rows[0]) {
            const existing = recipientFromRow(previous.rows[0]);
            if (!sameDraft(existing, recipient)) throw Object.assign(new Error(`${index + 1}행: 이미 저장된 행과 내용이 다릅니다. 목록을 확인해 주세요.`), { status: 409 });
            saved.push(existing);
          } else {
            await insertRecipient(recipient, client);
            saved.push({ ...recipient, longTermCareNumber: visibleCareNumber(recipient.longTermCareNumber), recontractCount: 0 });
          }
        }
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
      sendJson(response, 200, { recipients: saved });
      return;
    }

    if (parts[1] === "employment-contracts" && parts[2] === "bulk-drafts" && request.method === "POST") {
      const contracts = prepareEmploymentDraftRows(await readBody(request)).map((body) => normalizeEmploymentContract(body));
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const [index, contract] of contracts.entries()) {
          const { rows } = await client.query("SELECT * FROM employment_contracts WHERE id = $1", [contract.id]);
          const row = rows[0];
          if (row) {
            const existing = { isDraft: row.is_draft === true, workerName: row.worker_name, residentRegistrationNumber: row.resident_registration_number,
              workerPhone: row.worker_phone, primaryBank: row.primary_bank, bankAccountNumber: row.bank_account_number,
              contractStartDate: row.contract_start_date, contractEndDate: row.contract_end_date };
            if (!sameEmploymentDraft(existing, contract)) throw Object.assign(new Error(`${index + 1}행: 이미 저장된 계약과 내용이 다릅니다. 목록을 확인해 주세요.`), { status: 409 });
          } else {
            await insertEmploymentContract(contract, client);
            await replaceEmploymentContractChildren(contract, client);
          }
        }
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
      const saved = await Promise.all(contracts.map(async (contract) => employmentContractFromRow(await readEmploymentContractRow(contract.id))));
      sendJson(response, 200, { contracts: saved });
      return;
    }

    if (parts[1] === "employment-contracts") {
      if (!parts[2] && request.method === "GET") {
        const { rows } = await pool.query(
          "SELECT * FROM employment_contracts ORDER BY contract_start_date DESC, worker_name ASC"
        );
        sendJson(response, 200, await Promise.all(rows.map(employmentContractFromRow)));
        return;
      }

      if (parts[2] && !parts[3] && request.method === "GET") {
        const row = await readEmploymentContractRow(parts[2]);
        sendJson(
          response,
          row ? 200 : 404,
          row ? await employmentContractFromRow(row) : { error: "Employment contract not found" }
        );
        return;
      }

      if (!parts[2] && request.method === "POST") {
        const contract = normalizeEmploymentContract(await readBody(request));
        await saveEmploymentContract(contract, false);
        sendJson(response, 201, contract);
        return;
      }

      if (parts[2] && !parts[3] && request.method === "PUT") {
        const row = await readEmploymentContractRow(parts[2]);

        if (!row) {
          sendJson(response, 404, { error: "Employment contract not found" });
          return;
        }

        const existing = await employmentContractFromRow(row);
        const contract = normalizeEmploymentContract(
          { ...(await readBody(request)), id: parts[2] },
          existing
        );

        await saveEmploymentContract(contract, true, existing.updatedAt);

        const updatedRow = await readEmploymentContractRow(parts[2]);
        sendJson(response, 200, await employmentContractFromRow(updatedRow));
        return;
      }

      if (parts[2] && request.method === "DELETE") {
        const result = await pool.query(
          "UPDATE employment_contracts SET enabled = FALSE, updated_at = $1 WHERE id = $2",
          [new Date().toISOString(), parts[2]]
        );
        sendJson(
          response,
          result.rowCount > 0 ? 200 : 404,
          result.rowCount > 0 ? { ok: true } : { error: "Employment contract not found" }
        );
        return;
      }

      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (!parts[2] && request.method === "GET") {
      const { rows } = await pool.query(`
        SELECT
          recipients.*,
          (
            SELECT COUNT(*)
            FROM recipient_contract_events
            WHERE recipient_id = recipients.id AND type IN ('restored', 'recontracted')
          ) AS recontract_count
        FROM recipients
        ORDER BY contract_expired_date ASC, name ASC
      `);
      sendJson(response, 200, rows.map(recipientFromRow));
      return;
    }

    if (parts[2] && !parts[3] && request.method === "GET") {
      const recipient = await readRecipient(parts[2]);
      sendJson(response, recipient ? 200 : 404, recipient ?? { error: "Recipient not found" });
      return;
    }

    if (parts[2] && parts[3] === "contract-events" && request.method === "GET") {
      const recipient = await readRecipient(parts[2]);

      if (!recipient) {
        sendJson(response, 404, { error: "Recipient not found" });
        return;
      }

      const { rows } = await pool.query(
        "SELECT * FROM recipient_contract_events WHERE recipient_id = $1 ORDER BY created_at DESC",
        [parts[2]]
      );
      sendJson(
        response,
        200,
        rows.map((row) => ({
          id: row.id,
          recipientId: row.recipient_id,
          type: row.type,
          documentsConfirmed: Boolean(row.documents_confirmed),
          serviceStartDate: row.service_start_date,
          serviceEndDate: row.service_end_date,
          contractRegisteredDate: row.contract_registered_date,
          contractExpiredDate: row.contract_expired_date,
          memo: row.memo,
          createdAt: row.created_at
        }))
      );
      return;
    }

    if (!parts[2] && request.method === "POST") {
      const recipient = normalizeRecipient(await readBody(request));
      await insertRecipient(recipient);
      sendJson(response, 201, { ...recipient, longTermCareNumber: visibleCareNumber(recipient.longTermCareNumber) });
      return;
    }

    if (parts[2] && !parts[3] && request.method === "PUT") {
      const existing = await readRecipient(parts[2]);

      if (!existing) {
        sendJson(response, 404, { error: "Recipient not found" });
        return;
      }

      const recipient = normalizeRecipient({ ...(await readBody(request)), id: parts[2] }, existing);
      await updateRecipient(recipient);

      sendJson(response, 200, await readRecipient(recipient.id));
      return;
    }

    if (parts[2] && parts[3] === "terminate" && request.method === "POST") {
      const existing = await readRecipient(parts[2]);

      if (!existing) {
        sendJson(response, 404, { error: "Recipient not found" });
        return;
      }

      const body = await readBody(request);
      const contractExpiredDate = assertString(body.contractExpiredDate, "contractExpiredDate");

      if (contractExpiredDate < existing.serviceStartDate) {
        throw new Error("serviceEndDate must not be earlier than serviceStartDate");
      }

      const recipient = normalizeRecipient(
        { ...existing, serviceEndDate: contractExpiredDate, contractExpiredDate, enabled: false },
        existing
      );
      await updateRecipient(recipient);
      await insertEvent({
        recipientId: recipient.id,
        type: "terminated",
        contractExpiredDate
      });

      sendJson(response, 200, await readRecipient(recipient.id));
      return;
    }

    if (parts[2] && parts[3] === "restore" && request.method === "POST") {
      const existing = await readRecipient(parts[2]);

      if (!existing) {
        sendJson(response, 404, { error: "Recipient not found" });
        return;
      }

      const body = await readBody(request);
      const restoreType = assertString(body.restoreType, "restoreType");

      if (!["paused_return", "recontracted"].includes(restoreType)) {
        throw new Error("restoreType is invalid");
      }

      const documentsConfirmed = assertBoolean(body.documentsConfirmed, "documentsConfirmed");

      if (!documentsConfirmed) {
        throw new Error("documentsConfirmed must be checked");
      }

      const nextBody =
        restoreType === "recontracted"
          ? {
              ...existing,
              serviceStartDate: assertString(body.serviceStartDate, "serviceStartDate"),
              serviceEndDate: assertString(body.serviceEndDate, "serviceEndDate"),
              contractRegisteredDate: assertString(
                body.contractRegisteredDate,
                "contractRegisteredDate"
              ),
              contractExpiredDate: assertString(body.contractExpiredDate, "contractExpiredDate"),
              enabled: true
            }
          : {
              ...existing,
              enabled: true
            };
      const recipient = normalizeRecipient(nextBody, existing);

      await updateRecipient(recipient);
      await insertEvent({
        recipientId: recipient.id,
        type: restoreType === "recontracted" ? "recontracted" : "restored",
        documentsConfirmed,
        serviceStartDate: recipient.serviceStartDate,
        serviceEndDate: recipient.serviceEndDate,
        contractRegisteredDate: recipient.contractRegisteredDate,
        contractExpiredDate: recipient.contractExpiredDate,
        memo: typeof body.memo === "string" ? body.memo.trim() || null : null
      });

      sendJson(response, 200, await readRecipient(recipient.id));
      return;
    }

    if (parts[2] && request.method === "DELETE") {
      const result = await pool.query(
        "UPDATE recipients SET enabled = FALSE, updated_at = $1 WHERE id = $2",
        [new Date().toISOString(), parts[2]]
      );

      if (result.rowCount > 0) {
        await insertEvent({
          recipientId: parts[2],
          type: "deactivated"
        });
      }

      sendJson(
        response,
        result.rowCount > 0 ? 200 : 404,
        result.rowCount > 0 ? { ok: true } : { error: "Recipient not found" }
      );
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof AuthError) {
      sendJson(response, error.status, { error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = error?.status === 404 ? 404 : error?.status === 409 || message.includes("duplicate key") ? 409 : 400;
    sendJson(response, statusCode, {
      error:
        statusCode === 409 && error?.status !== 409
          ? "중복된 고유값이 이미 등록되어 있습니다."
          : message
    });
  }
};

if (!process.env.VERCEL) {
  const server = createServer(handlePostgresRequest);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Miso Backoffice Postgres API running at http://127.0.0.1:${port}`);
  });
}

export default handlePostgresRequest;
