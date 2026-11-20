CREATE TABLE IF NOT EXISTS staff_directory_profiles (
  id TEXT PRIMARY KEY,
  anchor_contract_id TEXT UNIQUE REFERENCES employment_contracts(id),
  payload TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
