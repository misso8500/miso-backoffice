CREATE TABLE IF NOT EXISTS work_staff_counseling (
 id TEXT PRIMARY KEY,employee_contract_id TEXT NOT NULL REFERENCES employment_contracts(id),
 consultation_date TEXT NOT NULL,payload TEXT NOT NULL,version INTEGER NOT NULL,
 created_by TEXT NOT NULL,updated_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_counseling_employee ON work_staff_counseling(employee_contract_id,consultation_date DESC);
CREATE TABLE IF NOT EXISTS work_staff_counseling_events (
 id TEXT PRIMARY KEY,counseling_id TEXT NOT NULL REFERENCES work_staff_counseling(id),
 version INTEGER NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,
 actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(counseling_id,version)
);
