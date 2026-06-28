import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const localConfigPath = join(rootDir, "miso-backoffice.local.json");
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
    createdAt: "2026-04-29T09:20:00+09:00",
    updatedAt: "2026-04-29T09:20:00+09:00"
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
    birth_date TEXT NOT NULL,
    long_term_care_number TEXT NOT NULL UNIQUE,
    care_grade TEXT NOT NULL,
    phone TEXT,
    address TEXT NOT NULL,
    representative_name TEXT NOT NULL,
    representative_relation TEXT NOT NULL,
    representative_phone TEXT NOT NULL,
    service_start_date TEXT NOT NULL,
    service_end_date TEXT NOT NULL,
    contract_registered_date TEXT NOT NULL,
    contract_expired_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_recipients_contract_expired
    ON recipients(contract_expired_date ASC);
`);

const recipientFromRow = (row) => ({
  id: row.id,
  name: row.name,
  birthDate: row.birth_date,
  longTermCareNumber: row.long_term_care_number,
  careGrade: row.care_grade,
  ...(row.phone ? { phone: row.phone } : {}),
  address: row.address,
  representativeName: row.representative_name,
  representativeRelation: row.representative_relation,
  representativePhone: row.representative_phone,
  serviceStartDate: row.service_start_date,
  serviceEndDate: row.service_end_date,
  contractRegisteredDate: row.contract_registered_date,
  contractExpiredDate: row.contract_expired_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const insertRecipient = db.prepare(`
  INSERT INTO recipients (
    id, name, birth_date, long_term_care_number, care_grade, phone, address,
    representative_name, representative_relation, representative_phone,
    service_start_date, service_end_date, contract_registered_date,
    contract_expired_date, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

if (db.prepare("SELECT COUNT(*) AS count FROM recipients").get().count === 0) {
  for (const recipient of sampleRecipients) {
    insertRecipient.run(
      recipient.id,
      recipient.name,
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
      recipient.contractRegisteredDate,
      recipient.contractExpiredDate,
      recipient.createdAt,
      recipient.updatedAt
    );
  }
}

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

const normalizeRecipient = (body, existing = null) => {
  const now = new Date().toISOString();
  const recipient = {
    id: assertString(body.id ?? existing?.id, "id"),
    name: assertString(body.name, "name"),
    birthDate: assertString(body.birthDate, "birthDate"),
    longTermCareNumber: assertString(body.longTermCareNumber, "longTermCareNumber"),
    careGrade: assertString(body.careGrade, "careGrade"),
    phone: assertString(body.phone, "phone", { optional: true }),
    address: assertString(body.address, "address"),
    representativeName: assertString(body.representativeName, "representativeName"),
    representativeRelation: assertString(body.representativeRelation, "representativeRelation"),
    representativePhone: assertString(body.representativePhone, "representativePhone"),
    serviceStartDate: assertString(body.serviceStartDate, "serviceStartDate"),
    serviceEndDate: assertString(body.serviceEndDate, "serviceEndDate"),
    contractRegisteredDate: assertString(body.contractRegisteredDate, "contractRegisteredDate"),
    contractExpiredDate: assertString(body.contractExpiredDate, "contractExpiredDate"),
    createdAt: existing?.createdAt ?? body.createdAt ?? now,
    updatedAt: now
  };

  if (recipient.serviceStartDate > recipient.serviceEndDate) {
    throw new Error("serviceStartDate must not be later than serviceEndDate");
  }

  if (recipient.contractRegisteredDate > recipient.contractExpiredDate) {
    throw new Error("contractRegisteredDate must not be later than contractExpiredDate");
  }

  return recipient;
};

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  try {
    const parts = parsePath(request.url ?? "/");

    if (parts[0] !== "api" || parts[1] !== "recipients") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (!parts[2] && request.method === "GET") {
      const rows = db
        .prepare("SELECT * FROM recipients ORDER BY contract_expired_date ASC, name ASC")
        .all();
      sendJson(response, 200, rows.map(recipientFromRow));
      return;
    }

    if (parts[2] && request.method === "GET") {
      const row = db.prepare("SELECT * FROM recipients WHERE id = ?").get(parts[2]);
      sendJson(response, row ? 200 : 404, row ? recipientFromRow(row) : { error: "Recipient not found" });
      return;
    }

    if (!parts[2] && request.method === "POST") {
      const recipient = normalizeRecipient(await readBody(request));
      insertRecipient.run(
        recipient.id,
        recipient.name,
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
        recipient.contractRegisteredDate,
        recipient.contractExpiredDate,
        recipient.createdAt,
        recipient.updatedAt
      );
      sendJson(response, 201, recipient);
      return;
    }

    if (parts[2] && request.method === "PUT") {
      const row = db.prepare("SELECT * FROM recipients WHERE id = ?").get(parts[2]);

      if (!row) {
        sendJson(response, 404, { error: "Recipient not found" });
        return;
      }

      const existing = recipientFromRow(row);
      const recipient = normalizeRecipient({ ...(await readBody(request)), id: parts[2] }, existing);

      db.prepare(`
        UPDATE recipients SET
          name = ?, birth_date = ?, long_term_care_number = ?, care_grade = ?,
          phone = ?, address = ?, representative_name = ?, representative_relation = ?,
          representative_phone = ?, service_start_date = ?, service_end_date = ?,
          contract_registered_date = ?, contract_expired_date = ?, updated_at = ?
        WHERE id = ?
      `).run(
        recipient.name,
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
        recipient.contractRegisteredDate,
        recipient.contractExpiredDate,
        recipient.updatedAt,
        recipient.id
      );

      sendJson(response, 200, recipient);
      return;
    }

    if (parts[2] && request.method === "DELETE") {
      const result = db.prepare("DELETE FROM recipients WHERE id = ?").run(parts[2]);
      sendJson(response, result.changes > 0 ? 200 : 404, result.changes > 0 ? { ok: true } : { error: "Recipient not found" });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = message.includes("UNIQUE constraint failed") ? 409 : 400;
    sendJson(response, statusCode, {
      error:
        statusCode === 409
          ? "같은 장기요양인정번호가 이미 등록되어 있습니다."
          : message
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Miso Backoffice API running at http://127.0.0.1:${port}`);
  console.log(`Miso Backoffice database: ${dbPath}`);
});
