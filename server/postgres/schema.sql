CREATE TABLE IF NOT EXISTS recipients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  operational_name TEXT,
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
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipients_contract_expired
  ON recipients(contract_expired_date ASC);

ALTER TABLE recipients ADD COLUMN IF NOT EXISTS operational_name TEXT;

CREATE TABLE IF NOT EXISTS recipient_contract_events (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  type TEXT NOT NULL,
  documents_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
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
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
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
