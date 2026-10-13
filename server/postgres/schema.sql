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
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipients_contract_expired
  ON recipients(contract_expired_date ASC);

ALTER TABLE recipients ADD COLUMN IF NOT EXISTS operational_name TEXT;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT '방문';
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS caregiver_requirements TEXT NOT NULL DEFAULT '';
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS reduction_type TEXT NOT NULL DEFAULT '일반';
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS related_people TEXT NOT NULL DEFAULT '';
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS assigned_backoffice_user_id TEXT;

CREATE TABLE IF NOT EXISTS backoffice_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backoffice_sessions (
  device_id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES backoffice_users(id),
  last_seen_at TEXT NOT NULL
);

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

-- Business data is served by our authenticated server using the database owner.
-- Supabase public/ordinary authenticated clients must not read these tables directly.
ALTER TABLE recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE backoffice_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE backoffice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipient_contract_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_contract_recipient_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_insurance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_contract_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE recipients FROM anon, authenticated;
REVOKE ALL ON TABLE backoffice_users FROM anon, authenticated;
REVOKE ALL ON TABLE backoffice_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE recipient_contract_events FROM anon, authenticated;
REVOKE ALL ON TABLE employment_contracts FROM anon, authenticated;
REVOKE ALL ON TABLE employment_contract_recipient_assignments FROM anon, authenticated;
REVOKE ALL ON TABLE employment_insurance_snapshots FROM anon, authenticated;
REVOKE ALL ON TABLE employment_contract_terms FROM anon, authenticated;

-- Optional rich work conditions; NULL preserves legacy contract interpretation.
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS work_conditions JSONB;
