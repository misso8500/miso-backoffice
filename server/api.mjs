import { handleDriveRequest } from "./drive.mjs";
import { prepareEmploymentBody, prepareEmploymentDraftRows, sameEmploymentDraft } from "./employment-drafts.mjs";
import { prepareRecipientBody, prepareDraftRows, sameDraft, visibleCareNumber } from "./recipient-drafts.mjs";
import { normalizeWorkConditions } from "./work-conditions.mjs";
import { loadEnv } from "./load-env.mjs";
import { AuthError, handleAuthRequest } from "./auth.mjs";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const localConfigPath = join(rootDir, "miso-backoffice.local.json");
loadEnv(rootDir);
const port = Number(process.env.PORT ?? 5174);

const sampleRecipients = [
  {
    id: "recipient-001",
    name: "김미소",
    birthDate: "1942-03-15",
    longTermCareNumber: "LTC-2026-0001",
    careGrade: "3등급",
    phone: "010-1111-2222",
    address: "서울시 강서구 예시로 10",
    representativeName: "박하나",
    representativeRelation: "자녀",
    representativePhone: "010-2222-3333",
    serviceStartDate: "2026-01-01",
    serviceEndDate: "2026-12-31",
    contractRegisteredDate: "2025-12-20",
    contractExpiredDate: "2026-12-31",
    enabled: true,
    createdAt: "2026-04-29T09:00:00+09:00",
    updatedAt: "2026-04-29T09:00:00+09:00"
  },
  {
    id: "recipient-002",
    name: "이미래",
    birthDate: "1938-08-21",
    longTermCareNumber: "LTC-2026-0002",
    careGrade: "2등급",
    phone: null,
    address: "서울시 양천구 예시길 22",
    representativeName: "최도윤",
    representativeRelation: "배우자",
    representativePhone: "010-3333-4444",
    serviceStartDate: "2026-02-01",
    serviceEndDate: "2027-01-31",
    contractRegisteredDate: "2026-01-25",
    contractExpiredDate: "2027-01-31",
    enabled: true,
    createdAt: "2026-04-29T09:10:00+09:00",
    updatedAt: "2026-04-29T09:10:00+09:00"
  },
  {
    id: "recipient-003",
    name: "정바른",
    birthDate: "1945-11-02",
    longTermCareNumber: "LTC-2026-0003",
    careGrade: "4등급",
    phone: "010-4444-5555",
    address: "서울시 마포구 샘플대로 5",
    representativeName: "한서연",
    representativeRelation: "조카",
    representativePhone: "010-5555-6666",
    serviceStartDate: "2025-05-01",
    serviceEndDate: "2026-04-30",
    contractRegisteredDate: "2025-04-20",
    contractExpiredDate: "2026-04-30",
    enabled: true,
    createdAt: "2026-04-29T09:20:00+09:00",
    updatedAt: "2026-04-29T09:20:00+09:00"
  }
];

const sampleEmploymentContracts = [
  {
    id: "employment-contract-001",
    workerName: "오하늘",
    workerBirthDate: "1988-06-12",
    residentRegistrationNumber: "880612-2******",
    workerPhone: "010-7777-8888",
    primaryBank: "국민은행",
    bankAccountNumber: "123-456-789012",
    workerAddress: "서울시 강서구 근로로 14",
    jobTitle: "요양보호사",
    employmentType: "기간의 정함이 있는 근로계약",
    workplaceType: "recipient_home",
    workplace: "미소방문요양 강서센터",
    recipientAssignments: ["recipient-001"],
    contractStartDate: "2026-07-01",
    contractEndDate: "2027-06-30",
    workDays: "월,화,수,목,금",
    workStartTime: "09:00",
    workEndTime: "18:00",
    breakMinutes: 60,
    wageType: "월급",
    wageAmount: 2300000,
    nonTaxableVehicleAllowance: 100000,
    nonTaxableMealAllowance: 0,
    taxableExtraPay: 0,
    allowanceMemo: "수급자 댁 방문 교통비 보전",
    paymentDate: "매월 10일",
    insuranceStatus: "4대보험 가입",
    insuranceSnapshots: [
      {
        status: "4대보험 가입",
        effectiveStartDate: "2026-07-01",
        effectiveEndDate: "2027-06-30",
        weeklyHours: 40,
        memo: "김미소 수급자 방문 근무 기준"
      }
    ],
    contractTerms: [
      {
        wageType: "월급",
        wageAmount: 2300000,
        nonTaxableMealAllowance: 0,
        nonTaxableVehicleAllowance: 100000,
        otherNonTaxablePay: 0
      }
    ],
    memo: "신규 입사 근로계약",
    enabled: true,
    createdAt: "2026-07-01T09:00:00+09:00",
    updatedAt: "2026-07-01T09:00:00+09:00"
  }
];

const readConfiguredDbPath = () => {
  if (process.env.MISO_BACKOFFICE_DB_PATH) {
    return process.env.MISO_BACKOFFICE_DB_PATH;
  }

  if (!existsSync(localConfigPath)) {
    return null;
  }

  const config = JSON.parse(readFileSync(localConfigPath, "utf8"));
  return typeof config.dbPath === "string" ? config.dbPath : null;
};

const configuredDbPath = readConfiguredDbPath();
const relativeDbPath = configuredDbPath || join("data", "miso-backoffice.sqlite");
const dbPath = isAbsolute(relativeDbPath) ? relativeDbPath : resolve(rootDir, relativeDbPath);

mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS recipients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    operational_name TEXT,
    assigned_backoffice_user_id TEXT,
    birth_date TEXT NOT NULL,
    long_term_care_number TEXT NOT NULL UNIQUE,
    care_grade TEXT NOT NULL,
    phone TEXT,
    address TEXT NOT NULL,
    representative_name TEXT NOT NULL,
    representative_relation TEXT NOT NULL,
    representative_phone TEXT NOT NULL,
    service_type TEXT NOT NULL DEFAULT '방문',
    caregiver_requirements TEXT NOT NULL DEFAULT '',
    reduction_type TEXT NOT NULL DEFAULT '일반',
    related_people TEXT NOT NULL DEFAULT '',
    service_start_date TEXT NOT NULL,
    service_end_date TEXT NOT NULL,
    contract_registered_date TEXT NOT NULL,
    contract_expired_date TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_recipients_contract_expired
    ON recipients(contract_expired_date ASC);

  CREATE TABLE IF NOT EXISTS recipient_contract_events (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    type TEXT NOT NULL,
    documents_confirmed INTEGER NOT NULL DEFAULT 0,
    service_start_date TEXT,
    service_end_date TEXT,
    contract_registered_date TEXT,
    contract_expired_date TEXT,
    memo TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (recipient_id) REFERENCES recipients(id)
  );

  CREATE INDEX IF NOT EXISTS idx_recipient_contract_events_recipient
    ON recipient_contract_events(recipient_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS backoffice_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS backoffice_sessions (
    device_id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES backoffice_users(id)
  );

  CREATE TABLE IF NOT EXISTS employment_contracts (
    id TEXT PRIMARY KEY,
    worker_name TEXT NOT NULL,
    worker_birth_date TEXT NOT NULL,
    resident_registration_number TEXT NOT NULL DEFAULT '',
    worker_phone TEXT,
    primary_bank TEXT NOT NULL DEFAULT '',
    bank_account_number TEXT NOT NULL DEFAULT '',
    worker_address TEXT NOT NULL,
    job_title TEXT NOT NULL,
    employment_type TEXT NOT NULL,
    workplace_type TEXT NOT NULL DEFAULT 'office',
    workplace TEXT NOT NULL,
    contract_start_date TEXT NOT NULL,
    contract_end_date TEXT,
    work_days TEXT NOT NULL,
    work_start_time TEXT NOT NULL,
    work_end_time TEXT NOT NULL,
    break_minutes INTEGER NOT NULL DEFAULT 0,
    wage_type TEXT NOT NULL,
    wage_amount INTEGER NOT NULL,
    non_taxable_vehicle_allowance INTEGER NOT NULL DEFAULT 0,
    non_taxable_meal_allowance INTEGER NOT NULL DEFAULT 0,
    taxable_extra_pay INTEGER NOT NULL DEFAULT 0,
    allowance_memo TEXT,
    payment_date TEXT NOT NULL,
    insurance_status TEXT NOT NULL,
    memo TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_employment_contracts_start_date
    ON employment_contracts(contract_start_date DESC, worker_name ASC);

  CREATE TABLE IF NOT EXISTS employment_contract_recipient_assignments (
    employment_contract_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (employment_contract_id, recipient_id),
    FOREIGN KEY (employment_contract_id) REFERENCES employment_contracts(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES recipients(id)
  );

  CREATE INDEX IF NOT EXISTS idx_employment_assignments_recipient
    ON employment_contract_recipient_assignments(recipient_id);

  CREATE TABLE IF NOT EXISTS employment_insurance_snapshots (
    id TEXT PRIMARY KEY,
    employment_contract_id TEXT NOT NULL,
    status TEXT NOT NULL,
    effective_start_date TEXT NOT NULL,
    effective_end_date TEXT,
    weekly_hours INTEGER NOT NULL DEFAULT 0,
    memo TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (employment_contract_id) REFERENCES employment_contracts(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_employment_insurance_snapshots_contract
    ON employment_insurance_snapshots(employment_contract_id, effective_start_date DESC);

  CREATE TABLE IF NOT EXISTS employment_contract_terms (
    id TEXT PRIMARY KEY,
    employment_contract_id TEXT NOT NULL,
    wage_type TEXT NOT NULL,
    wage_amount INTEGER NOT NULL,
    non_taxable_meal_allowance INTEGER NOT NULL DEFAULT 0,
    non_taxable_vehicle_allowance INTEGER NOT NULL DEFAULT 0,
    other_non_taxable_pay INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (employment_contract_id) REFERENCES employment_contracts(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_employment_contract_terms_contract
    ON employment_contract_terms(employment_contract_id, created_at ASC);
`);

const recipientColumns = db.prepare("PRAGMA table_info(recipients)").all();
const hasEnabledColumn = recipientColumns.some((column) => column.name === "enabled");
const hasOperationalNameColumn = recipientColumns.some((column) => column.name === "operational_name");

if (!hasEnabledColumn) {
  db.exec("ALTER TABLE recipients ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
}

if (!hasOperationalNameColumn) {
  db.exec("ALTER TABLE recipients ADD COLUMN operational_name TEXT");
}

const ensureRecipientColumn = (name, definition) => {
  const columns = db.prepare("PRAGMA table_info(recipients)").all();
  if (!columns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE recipients ADD COLUMN ${name} ${definition}`);
  }
};

ensureRecipientColumn("is_draft", "INTEGER NOT NULL DEFAULT 0");
ensureRecipientColumn("service_type", "TEXT NOT NULL DEFAULT '방문'");
ensureRecipientColumn("caregiver_requirements", "TEXT NOT NULL DEFAULT ''");
ensureRecipientColumn("reduction_type", "TEXT NOT NULL DEFAULT '일반'");
ensureRecipientColumn("related_people", "TEXT NOT NULL DEFAULT ''");
ensureRecipientColumn("assigned_backoffice_user_id", "TEXT");

const ensureEmploymentColumn = (name, definition) => {
  const columns = db.prepare("PRAGMA table_info(employment_contracts)").all();

  if (!columns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE employment_contracts ADD COLUMN ${name} ${definition}`);
  }
};

ensureEmploymentColumn("is_draft", "INTEGER NOT NULL DEFAULT 0");
ensureEmploymentColumn("workplace_type", "TEXT NOT NULL DEFAULT 'office'");
ensureEmploymentColumn("resident_registration_number", "TEXT NOT NULL DEFAULT ''");
ensureEmploymentColumn("primary_bank", "TEXT NOT NULL DEFAULT ''");
ensureEmploymentColumn("bank_account_number", "TEXT NOT NULL DEFAULT ''");
ensureEmploymentColumn("non_taxable_vehicle_allowance", "INTEGER NOT NULL DEFAULT 0");
ensureEmploymentColumn("non_taxable_meal_allowance", "INTEGER NOT NULL DEFAULT 0");
ensureEmploymentColumn("taxable_extra_pay", "INTEGER NOT NULL DEFAULT 0");
ensureEmploymentColumn("allowance_memo", "TEXT");

const recipientFromRow = (row) => ({
  id: row.id,
  name: row.name,
  ...(row.operational_name ? { operationalName: row.operational_name } : {}),
  ...(row.assigned_backoffice_user_id ? { assignedBackofficeUserId: row.assigned_backoffice_user_id } : {}),
  birthDate: row.birth_date,
  isDraft: row.is_draft === 1,
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
  serviceStartDate: row.service_start_date,
  serviceEndDate: row.service_end_date,
  contractRegisteredDate: row.contract_registered_date,
  contractExpiredDate: row.contract_expired_date,
  enabled: row.enabled !== 0,
  recontractCount: Number(row.recontract_count ?? 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const employmentAssignmentsForContract = (contractId) =>
  db
    .prepare(
      `
        SELECT
          recipients.id AS recipient_id,
          recipients.name AS recipient_name,
          recipients.care_grade,
          recipients.address
        FROM employment_contract_recipient_assignments
        JOIN recipients ON recipients.id = employment_contract_recipient_assignments.recipient_id
        WHERE employment_contract_id = ?
        ORDER BY recipients.name ASC
      `
    )
    .all(contractId)
    .map((row) => ({
      recipientId: row.recipient_id,
      recipientName: row.recipient_name,
      careGrade: row.care_grade,
      workplaceAddress: row.address
    }));

const insuranceSnapshotsForContract = (contractId) =>
  db
    .prepare(
      `
        SELECT *
        FROM employment_insurance_snapshots
        WHERE employment_contract_id = ?
        ORDER BY effective_start_date DESC, created_at DESC
      `
    )
    .all(contractId)
    .map((row) => ({
      id: row.id,
      status: row.status,
      effectiveStartDate: row.effective_start_date,
      ...(row.effective_end_date ? { effectiveEndDate: row.effective_end_date } : {}),
      weeklyHours: Number(row.weekly_hours ?? 0),
      ...(row.memo ? { memo: row.memo } : {})
    }));

if (!db.prepare("PRAGMA table_info(employment_contracts)").all().some((column) => column.name === "work_conditions")) {
  db.exec("ALTER TABLE employment_contracts ADD COLUMN work_conditions TEXT");
}

const contractTermsForContract = (contractId, row) => {
  const terms = db
    .prepare(
      `
        SELECT *
        FROM employment_contract_terms
        WHERE employment_contract_id = ?
        ORDER BY created_at ASC
      `
    )
    .all(contractId)
    .map((term) => ({
      id: term.id,
      wageType: term.wage_type,
      wageAmount: Number(term.wage_amount ?? 0),
      nonTaxableMealAllowance: Number(term.non_taxable_meal_allowance ?? 0),
      nonTaxableVehicleAllowance: Number(term.non_taxable_vehicle_allowance ?? 0),
      otherNonTaxablePay: Number(term.other_non_taxable_pay ?? 0)
    }));

  if (terms.length > 0) {
    const order = row.work_conditions ? JSON.parse(row.work_conditions).conditions.map((condition) => condition.termId) : [];
    if (order.length) terms.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return terms;
  }

  return [
    {
      id: `${contractId}-legacy-term`,
      wageType: row.wage_type,
      wageAmount: Number(row.wage_amount ?? 0),
      nonTaxableMealAllowance: Number(row.non_taxable_meal_allowance ?? 0),
      nonTaxableVehicleAllowance: Number(row.non_taxable_vehicle_allowance ?? 0),
      otherNonTaxablePay: Number(row.taxable_extra_pay ?? 0)
    }
  ];
};

const employmentContractFromRow = (row) => ({
  id: row.id,
  isDraft: row.is_draft === 1,
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
  recipientAssignments: employmentAssignmentsForContract(row.id),
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
  insuranceSnapshots: insuranceSnapshotsForContract(row.id),
  ...(row.work_conditions ? { workConditions: JSON.parse(row.work_conditions) } : {}),
  contractTerms: contractTermsForContract(row.id, row),
  ...(row.memo ? { memo: row.memo } : {}),
  enabled: row.enabled !== 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const insertRecipient = db.prepare(`
  INSERT INTO recipients (
    id, name, operational_name, assigned_backoffice_user_id, birth_date, long_term_care_number, care_grade, phone, address,
    representative_name, representative_relation, representative_phone,
    service_type, caregiver_requirements, reduction_type, related_people,
    service_start_date, service_end_date, contract_registered_date,
    contract_expired_date, enabled, created_at, updated_at, is_draft
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertEmploymentContract = db.prepare(`
  INSERT INTO employment_contracts (
    id, worker_name, worker_birth_date, resident_registration_number, worker_phone,
    primary_bank, bank_account_number, worker_address, job_title,
    employment_type, workplace_type, workplace, contract_start_date, contract_end_date, work_days,
    work_start_time, work_end_time, break_minutes, wage_type, wage_amount,
    non_taxable_vehicle_allowance, non_taxable_meal_allowance, taxable_extra_pay,
    allowance_memo, payment_date, insurance_status, memo, enabled, created_at, updated_at, is_draft
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertEmploymentRecord = (contract) => insertEmploymentContract.run(
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
          contract.enabled ? 1 : 0,
          contract.createdAt,
          contract.updatedAt,
          contract.isDraft ? 1 : 0
        );

const insertEmploymentAssignment = db.prepare(`
  INSERT OR IGNORE INTO employment_contract_recipient_assignments (
    employment_contract_id, recipient_id, created_at
  ) VALUES (?, ?, ?)
`);

const insertInsuranceSnapshot = db.prepare(`
  INSERT INTO employment_insurance_snapshots (
    id, employment_contract_id, status, effective_start_date, effective_end_date,
    weekly_hours, memo, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertEmploymentContractTerm = db.prepare(`
  INSERT INTO employment_contract_terms (
    id, employment_contract_id, wage_type, wage_amount, non_taxable_meal_allowance,
    non_taxable_vehicle_allowance, other_non_taxable_pay, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const createEventId = () => `contract-event-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const insertContractEvent = db.prepare(`
  INSERT INTO recipient_contract_events (
    id, recipient_id, type, documents_confirmed, service_start_date, service_end_date,
    contract_registered_date, contract_expired_date, memo, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const selectRecipientById = db.prepare(`
  SELECT
    recipients.*,
    (
      SELECT COUNT(*)
      FROM recipient_contract_events
      WHERE recipient_id = recipients.id AND type IN ('restored', 'recontracted')
    ) AS recontract_count
  FROM recipients
  WHERE id = ?
`);

const readRecipient = (recipientId) => {
  const row = selectRecipientById.get(recipientId);
  return row ? recipientFromRow(row) : null;
};

const insertEvent = ({
  recipientId,
  type,
  documentsConfirmed = false,
  serviceStartDate = null,
  serviceEndDate = null,
  contractRegisteredDate = null,
  contractExpiredDate = null,
  memo = null
}) => {
  insertContractEvent.run(
    createEventId(),
    recipientId,
    type,
    documentsConfirmed ? 1 : 0,
    serviceStartDate,
    serviceEndDate,
    contractRegisteredDate,
    contractExpiredDate,
    memo,
    new Date().toISOString()
  );
};

if (db.prepare("SELECT COUNT(*) AS count FROM recipients").get().count === 0) {
  for (const recipient of sampleRecipients) {
    insertRecipient.run(
      recipient.id,
      recipient.name,
      recipient.operationalName ?? null,
      recipient.assignedBackofficeUserId ?? null,
      recipient.birthDate,
      recipient.longTermCareNumber,
      recipient.careGrade,
      recipient.phone,
      recipient.address,
      recipient.representativeName,
      recipient.representativeRelation,
      recipient.representativePhone,
      recipient.serviceType ?? "방문",
      recipient.caregiverRequirements ?? "",
      recipient.reductionType ?? "일반",
      recipient.relatedPeople ?? "",
      recipient.serviceStartDate,
      recipient.serviceEndDate,
      recipient.contractRegisteredDate,
      recipient.contractExpiredDate,
      recipient.enabled ? 1 : 0,
      recipient.createdAt,
      recipient.updatedAt,
      recipient.isDraft ? 1 : 0
    );
  }
}

if (db.prepare("SELECT COUNT(*) AS count FROM employment_contracts").get().count === 0) {
  for (const contract of sampleEmploymentContracts) {
    insertEmploymentContract.run(
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
      contract.enabled ? 1 : 0,
      contract.createdAt,
      contract.updatedAt,
      contract.isDraft ? 1 : 0
    );
    for (const recipientId of contract.recipientAssignments) {
      insertEmploymentAssignment.run(contract.id, recipientId, new Date().toISOString());
    }
    for (const snapshot of contract.insuranceSnapshots) {
      insertInsuranceSnapshot.run(
        `insurance-snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        contract.id,
        snapshot.status,
        snapshot.effectiveStartDate,
        snapshot.effectiveEndDate ?? null,
        snapshot.weeklyHours,
        snapshot.memo ?? null,
        new Date().toISOString()
      );
    }
    for (const term of contract.contractTerms) {
      insertEmploymentContractTerm.run(
        `employment-term-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        contract.id,
        term.wageType,
        term.wageAmount,
        term.nonTaxableMealAllowance,
        term.nonTaxableVehicleAllowance,
        term.otherNonTaxablePay,
        new Date().toISOString()
      );
    }
  }
}

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

const assertNumber = (value, field, { min = 0 } = {}) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < min) {
    throw new Error(`${field} must be a number greater than or equal to ${min}`);
  }

  return Math.round(numericValue);
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
    ? body.insuranceSnapshots.map((snapshot) => {
        const effectiveStartDate = assertString(
          snapshot.effectiveStartDate,
          "insuranceSnapshot.effectiveStartDate"
        );
        const effectiveEndDate = assertString(snapshot.effectiveEndDate, "effectiveEndDate", {
          optional: true
        });

        if (effectiveEndDate && effectiveStartDate > effectiveEndDate) {
          throw new Error("insurance effectiveStartDate must not be later than effectiveEndDate");
        }

        return {
          id:
            typeof snapshot.id === "string" && snapshot.id.trim()
              ? snapshot.id.trim()
              : `insurance-snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          status: assertString(snapshot.status, "insuranceSnapshot.status"),
          effectiveStartDate,
          effectiveEndDate,
          weeklyHours: assertNumber(snapshot.weeklyHours, "insuranceSnapshot.weeklyHours"),
          memo: assertString(snapshot.memo, "insuranceSnapshot.memo", { optional: true })
        };
      })
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

const assertBoolean = (value, field) => {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be checked`);
  }

  return value;
};

const applyRecipientUpdate = (recipient) => {
  db.prepare(`
    UPDATE recipients SET
      name = ?, operational_name = ?, assigned_backoffice_user_id = ?, birth_date = ?, long_term_care_number = ?, care_grade = ?,
      phone = ?, address = ?, representative_name = ?, representative_relation = ?,
      representative_phone = ?, service_start_date = ?, service_end_date = ?,
      service_type = ?, caregiver_requirements = ?, reduction_type = ?, related_people = ?,
      contract_registered_date = ?, contract_expired_date = ?, enabled = ?, updated_at = ?, is_draft = ?
    WHERE id = ?
  `).run(
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
    recipient.serviceStartDate,
    recipient.serviceEndDate,
    recipient.serviceType,
    recipient.caregiverRequirements,
    recipient.reductionType,
    recipient.relatedPeople,
    recipient.contractRegisteredDate,
    recipient.contractExpiredDate,
    recipient.enabled ? 1 : 0,
    recipient.updatedAt,
    recipient.isDraft ? 1 : 0,
    recipient.id
  );
};

const applyEmploymentContractUpdate = (contract) => {
  db.prepare(`
    UPDATE employment_contracts SET
      worker_name = ?, worker_birth_date = ?, resident_registration_number = ?,
      worker_phone = ?, primary_bank = ?, bank_account_number = ?, worker_address = ?,
      job_title = ?, employment_type = ?,
      workplace_type = ?, workplace = ?,
      contract_start_date = ?, contract_end_date = ?, work_days = ?, work_start_time = ?,
      work_end_time = ?, break_minutes = ?, wage_type = ?, wage_amount = ?,
      non_taxable_vehicle_allowance = ?, non_taxable_meal_allowance = ?,
      taxable_extra_pay = ?, allowance_memo = ?, payment_date = ?, insurance_status = ?,
      memo = ?, enabled = ?, updated_at = ?
    WHERE id = ?
  `).run(
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
    contract.enabled ? 1 : 0,
    contract.updatedAt,
    contract.id
  );
};

const replaceEmploymentContractChildren = (contract) => {
  db.prepare("UPDATE employment_contracts SET is_draft = ? WHERE id = ?").run(contract.isDraft ? 1 : 0, contract.id);
  db.prepare("UPDATE employment_contracts SET work_conditions = ? WHERE id = ?").run(contract.workConditions ? JSON.stringify(contract.workConditions) : null, contract.id);
  db.prepare("DELETE FROM employment_contract_recipient_assignments WHERE employment_contract_id = ?").run(
    contract.id
  );
  db.prepare("DELETE FROM employment_insurance_snapshots WHERE employment_contract_id = ?").run(
    contract.id
  );
  db.prepare("DELETE FROM employment_contract_terms WHERE employment_contract_id = ?").run(
    contract.id
  );

  const now = new Date().toISOString();

  for (const recipientId of contract.recipientAssignments) {
    insertEmploymentAssignment.run(contract.id, recipientId, now);
  }

  for (const snapshot of contract.insuranceSnapshots) {
    insertInsuranceSnapshot.run(
      snapshot.id,
      contract.id,
      snapshot.status,
      snapshot.effectiveStartDate,
      snapshot.effectiveEndDate,
      snapshot.weeklyHours,
      snapshot.memo,
      now
    );
  }

  for (const term of contract.contractTerms) {
    insertEmploymentContractTerm.run(
      term.id,
      contract.id,
      term.wageType,
      term.wageAmount,
      term.nonTaxableMealAllowance,
      term.nonTaxableVehicleAllowance,
      term.otherNonTaxablePay,
      now
    );
  }
};

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  try {
    const authentication = await handleAuthRequest(request, response, sendJson);
    if (authentication.handled) return;
    if (await handleDriveRequest(request, response, sendJson)) return;
    const parts = parsePath(request.url ?? "/");

    if (parts[0] === "api" && parts[1] === "backoffice-users") {
      const readState = () => ({
        users: db.prepare("SELECT id, name, birth_date AS birthDate, created_at AS createdAt FROM backoffice_users ORDER BY name ASC").all(),
        sessions: db.prepare(`
          SELECT s.device_id AS deviceId, s.device_name AS deviceName, s.user_id AS userId,
                 u.name AS userName, s.last_seen_at AS lastSeenAt
          FROM backoffice_sessions s JOIN backoffice_users u ON u.id = s.user_id
          WHERE s.last_seen_at >= ?
          ORDER BY s.last_seen_at DESC
        `).all(new Date(Date.now() - 45000).toISOString())
      });

      if (!parts[2] && request.method === "GET") {
        sendJson(response, 200, readState());
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
      const saved = [];
      db.exec("BEGIN");
      try {
        for (const [index, recipient] of rows.entries()) {
          const existing = readRecipient(recipient.id);
          if (existing) {
            if (!sameDraft(existing, recipient)) throw Object.assign(new Error(`${index + 1}행: 이미 저장된 행과 내용이 다릅니다. 목록을 확인해 주세요.`), { status: 409 });
            saved.push(existing);
          } else {
            insertRecipient.run(recipient.id, recipient.name, recipient.operationalName, recipient.assignedBackofficeUserId,
              recipient.birthDate, recipient.longTermCareNumber, recipient.careGrade, recipient.phone, recipient.address,
              recipient.representativeName, recipient.representativeRelation, recipient.representativePhone,
              recipient.serviceType, recipient.caregiverRequirements, recipient.reductionType, recipient.relatedPeople,
              recipient.serviceStartDate, recipient.serviceEndDate, recipient.contractRegisteredDate, recipient.contractExpiredDate,
              recipient.enabled ? 1 : 0, recipient.createdAt, recipient.updatedAt, 1);
            saved.push(readRecipient(recipient.id));
          }
        }
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      sendJson(response, 200, { recipients: saved });
      return;
    }

    if (parts[1] === "employment-contracts" && parts[2] === "bulk-drafts" && request.method === "POST") {
      const contracts = prepareEmploymentDraftRows(await readBody(request)).map((body) => normalizeEmploymentContract(body));
      const saved = [];
      db.exec("BEGIN");
      try {
        for (const [index, contract] of contracts.entries()) {
          const row = db.prepare("SELECT * FROM employment_contracts WHERE id = ?").get(contract.id);
          if (row) {
            const existing = employmentContractFromRow(row);
            if (!sameEmploymentDraft(existing, contract)) throw Object.assign(new Error(`${index + 1}행: 이미 저장된 계약과 내용이 다릅니다. 목록을 확인해 주세요.`), { status: 409 });
            saved.push(existing);
          } else {
            insertEmploymentRecord(contract);
            replaceEmploymentContractChildren(contract);
            saved.push(employmentContractFromRow(db.prepare("SELECT * FROM employment_contracts WHERE id = ?").get(contract.id)));
          }
        }
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      sendJson(response, 200, { contracts: saved });
      return;
    }

    if (parts[1] === "employment-contracts") {
      if (!parts[2] && request.method === "GET") {
        const rows = db
          .prepare(
            "SELECT * FROM employment_contracts ORDER BY contract_start_date DESC, worker_name ASC"
          )
          .all();
        sendJson(response, 200, rows.map(employmentContractFromRow));
        return;
      }

      if (parts[2] && !parts[3] && request.method === "GET") {
        const row = db.prepare("SELECT * FROM employment_contracts WHERE id = ?").get(parts[2]);
        sendJson(
          response,
          row ? 200 : 404,
          row ? employmentContractFromRow(row) : { error: "Employment contract not found" }
        );
        return;
      }

      if (!parts[2] && request.method === "POST") {
        const contract = normalizeEmploymentContract(await readBody(request));
        db.exec("BEGIN");
        try {
        insertEmploymentRecord(contract);
        replaceEmploymentContractChildren(contract);
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }

        sendJson(response, 201, contract);
        return;
      }

      if (parts[2] && !parts[3] && request.method === "PUT") {
        const row = db.prepare("SELECT * FROM employment_contracts WHERE id = ?").get(parts[2]);

        if (!row) {
          sendJson(response, 404, { error: "Employment contract not found" });
          return;
        }

        const existing = employmentContractFromRow(row);
        const contract = normalizeEmploymentContract(
          { ...(await readBody(request)), id: parts[2] },
          existing
        );

        db.exec("BEGIN");
        try {
          const latest = db.prepare("SELECT updated_at FROM employment_contracts WHERE id = ?").get(contract.id);
          if (latest?.updated_at !== existing.updatedAt) throw Object.assign(new Error("다른 사용자가 이 계약을 수정했습니다. 최신 계약을 다시 열어 수정해 주세요."), { status: 409 });
          applyEmploymentContractUpdate(contract);
          replaceEmploymentContractChildren(contract);
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }

        const updatedRow = db.prepare("SELECT * FROM employment_contracts WHERE id = ?").get(parts[2]);
        sendJson(response, 200, employmentContractFromRow(updatedRow));
        return;
      }

      if (parts[2] && request.method === "DELETE") {
        const result = db
          .prepare("UPDATE employment_contracts SET enabled = 0, updated_at = ? WHERE id = ?")
          .run(new Date().toISOString(), parts[2]);
        sendJson(
          response,
          result.changes > 0 ? 200 : 404,
          result.changes > 0 ? { ok: true } : { error: "Employment contract not found" }
        );
        return;
      }

      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (!parts[2] && request.method === "GET") {
      const rows = db
        .prepare(`
          SELECT
            recipients.*,
            (
              SELECT COUNT(*)
              FROM recipient_contract_events
              WHERE recipient_id = recipients.id AND type IN ('restored', 'recontracted')
            ) AS recontract_count
          FROM recipients
          ORDER BY contract_expired_date ASC, name ASC
        `)
        .all();
      sendJson(response, 200, rows.map(recipientFromRow));
      return;
    }

    if (parts[2] && !parts[3] && request.method === "GET") {
      const recipient = readRecipient(parts[2]);
      sendJson(response, recipient ? 200 : 404, recipient ?? { error: "Recipient not found" });
      return;
    }

    if (parts[2] && parts[3] === "contract-events" && request.method === "GET") {
      const recipient = readRecipient(parts[2]);

      if (!recipient) {
        sendJson(response, 404, { error: "Recipient not found" });
        return;
      }

      const rows = db
        .prepare(
          "SELECT * FROM recipient_contract_events WHERE recipient_id = ? ORDER BY created_at DESC"
        )
        .all(parts[2]);
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
      insertRecipient.run(
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
        recipient.enabled ? 1 : 0,
        recipient.createdAt,
        recipient.updatedAt,
        recipient.isDraft ? 1 : 0
      );
      sendJson(response, 201, { ...recipient, longTermCareNumber: visibleCareNumber(recipient.longTermCareNumber) });
      return;
    }

    if (parts[2] && !parts[3] && request.method === "PUT") {
      const existing = readRecipient(parts[2]);

      if (!existing) {
        sendJson(response, 404, { error: "Recipient not found" });
        return;
      }

      const recipient = normalizeRecipient({ ...(await readBody(request)), id: parts[2] }, existing);

      applyRecipientUpdate(recipient);

      sendJson(response, 200, readRecipient(recipient.id));
      return;
    }

    if (parts[2] && parts[3] === "terminate" && request.method === "POST") {
      const existing = readRecipient(parts[2]);

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
      applyRecipientUpdate(recipient);
      insertEvent({
        recipientId: recipient.id,
        type: "terminated",
        contractExpiredDate
      });

      sendJson(response, 200, readRecipient(recipient.id));
      return;
    }

    if (parts[2] && parts[3] === "restore" && request.method === "POST") {
      const existing = readRecipient(parts[2]);

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
      applyRecipientUpdate(recipient);
      insertEvent({
        recipientId: recipient.id,
        type: restoreType === "recontracted" ? "recontracted" : "restored",
        documentsConfirmed,
        serviceStartDate: recipient.serviceStartDate,
        serviceEndDate: recipient.serviceEndDate,
        contractRegisteredDate: recipient.contractRegisteredDate,
        contractExpiredDate: recipient.contractExpiredDate,
        memo: typeof body.memo === "string" ? body.memo.trim() || null : null
      });

      sendJson(response, 200, readRecipient(recipient.id));
      return;
    }

    if (parts[2] && request.method === "DELETE") {
      const result = db
        .prepare("UPDATE recipients SET enabled = 0, updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), parts[2]);
      if (result.changes > 0) {
        insertEvent({
          recipientId: parts[2],
          type: "deactivated"
        });
      }
      sendJson(
        response,
        result.changes > 0 ? 200 : 404,
        result.changes > 0 ? { ok: true } : { error: "Recipient not found" }
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
    const statusCode = error?.status === 409 || message.includes("UNIQUE constraint failed") ? 409 : 400;
    sendJson(response, statusCode, {
      error:
        statusCode === 409 && error?.status !== 409
          ? "같은 장기요양인정번호가 이미 등록되어 있습니다."
          : message
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Miso Backoffice API running at http://127.0.0.1:${port}`);
  console.log(`Miso Backoffice database: ${dbPath}`);
});
