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

-- Recipients may be saved before their detailed registration is complete.
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

-- Name-only employment entries are distinct from completed contracts.
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

-- Store Drive references only, never image binaries or service account credentials.
CREATE TABLE IF NOT EXISTS recipient_documents (
  recipient_id TEXT PRIMARY KEY REFERENCES recipients(id),
  folder_id TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  version TEXT NOT NULL
);
ALTER TABLE recipient_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE recipient_documents FROM anon, authenticated;

ALTER TABLE recipients ADD COLUMN IF NOT EXISTS medical_history TEXT NOT NULL DEFAULT '';

-- Immutable care-plan revisions, attributed only to a verified application user.
CREATE TABLE IF NOT EXISTS recipient_plans (
  id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES recipients(id), revision INTEGER NOT NULL,
  payload JSONB NOT NULL, effective_date TEXT, change_reason TEXT NOT NULL, change_kind TEXT NOT NULL,
  source_revision INTEGER, author_id TEXT, author_name TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(recipient_id, revision)
);
CREATE INDEX IF NOT EXISTS idx_recipient_plans_date ON recipient_plans(recipient_id, effective_date DESC, revision DESC);
ALTER TABLE recipient_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE recipient_plans FROM anon, authenticated;

-- Half-year execution schedules; existing memo records remain unclassified.
ALTER TABLE recipient_plans ADD COLUMN IF NOT EXISTS plan_id TEXT;
ALTER TABLE recipient_plans ADD COLUMN IF NOT EXISTS schedule JSONB;
CREATE INDEX IF NOT EXISTS idx_recipient_plan_logical ON recipient_plans(recipient_id, plan_id, revision DESC);

-- Shared work hub (WH-001); accessible only through the authenticated server.
CREATE TABLE IF NOT EXISTS work_members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  auth_id TEXT UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_assignees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS work_tasks (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES work_members(id),
  assignee_id TEXT REFERENCES work_members(id),
  roster_assignee_id TEXT REFERENCES work_assignees(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  due_date TEXT,
  related TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','cancelled')),
  completed_at TEXT,
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES work_members(id)
);
CREATE INDEX IF NOT EXISTS idx_work_tasks_assignee ON work_tasks(assignee_id, status, created_at);
CREATE TABLE IF NOT EXISTS work_task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES work_tasks(id),
  version INTEGER NOT NULL,
  actor_id TEXT NOT NULL REFERENCES work_members(id),
  kind TEXT NOT NULL CHECK (kind IN ('created','updated','cancelled')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(task_id, version)
);

CREATE TABLE IF NOT EXISTS work_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS work_recurrence_rules (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES work_members(id),
  assignee_id TEXT NOT NULL REFERENCES work_assignees(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('monthly','daily')),
  due_day INTEGER NOT NULL,
  include_saturday INTEGER NOT NULL,
  include_sunday INTEGER NOT NULL,
  include_leave INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  start_month TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_recurrence_instances (
  rule_id TEXT NOT NULL REFERENCES work_recurrence_rules(id),
  occurrence TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES work_tasks(id),
  PRIMARY KEY(rule_id, occurrence),
  UNIQUE(task_id)
);

CREATE TABLE IF NOT EXISTS staff_record_profiles (owner_id TEXT PRIMARY KEY REFERENCES work_members(id), staff_id TEXT NOT NULL UNIQUE REFERENCES work_assignees(id), payload TEXT NOT NULL, version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS staff_record_documents (owner_id TEXT NOT NULL REFERENCES work_members(id), kind TEXT NOT NULL CHECK(kind IN ('attendance','journal')), period TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','confirmed')), source_hash TEXT NOT NULL, version INTEGER NOT NULL, confirmed_at TEXT, PRIMARY KEY(owner_id,kind,period));
CREATE TABLE IF NOT EXISTS staff_leave_accounts (owner_id TEXT NOT NULL REFERENCES work_members(id), year TEXT NOT NULL, granted REAL NOT NULL, opening_used REAL NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(owner_id,year));
CREATE TABLE IF NOT EXISTS staff_leave_plans (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES work_members(id), year TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','confirmed','used','cancelled')), version INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_staff_leave_owner ON staff_leave_plans(owner_id,year);
CREATE TABLE IF NOT EXISTS staff_record_events (id TEXT PRIMARY KEY, actor_id TEXT REFERENCES work_members(id), owner_id TEXT NOT NULL REFERENCES work_members(id), kind TEXT NOT NULL, record_key TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS work_map_templates (id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS work_map_runs (id TEXT PRIMARY KEY, run_key TEXT NOT NULL UNIQUE, work_date TEXT NOT NULL, payload TEXT NOT NULL, version INTEGER NOT NULL);

ALTER TABLE work_tasks ADD COLUMN IF NOT EXISTS roster_assignee_id TEXT REFERENCES work_assignees(id);
ALTER TABLE work_tasks ADD COLUMN IF NOT EXISTS completed_at TEXT;
CREATE TABLE IF NOT EXISTS work_plans (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES work_tasks(id),
  assignee_id TEXT NOT NULL REFERENCES work_assignees(id),
  work_date TEXT NOT NULL,
  period TEXT NOT NULL CHECK(period IN ('morning','afternoon','unknown')),
  snapshot TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('planned','cancelled')),
  version INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES work_members(id),
  updated_by TEXT NOT NULL REFERENCES work_members(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_plan_active ON work_plans(task_id,assignee_id,work_date) WHERE status='planned';
CREATE INDEX IF NOT EXISTS idx_work_plan_day ON work_plans(work_date,assignee_id);
CREATE TABLE IF NOT EXISTS work_executions (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES work_tasks(id),
  plan_id TEXT REFERENCES work_plans(id),
  assignee_id TEXT NOT NULL REFERENCES work_assignees(id),
  work_date TEXT NOT NULL,
  period TEXT NOT NULL CHECK(period IN ('morning','afternoon','unknown')),
  content TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('recorded','voided')),
  version INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES work_members(id),
  updated_by TEXT NOT NULL REFERENCES work_members(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_execution_plan_active ON work_executions(plan_id,assignee_id) WHERE plan_id IS NOT NULL AND status='recorded';
CREATE INDEX IF NOT EXISTS idx_work_execution_day ON work_executions(work_date,assignee_id);
CREATE TABLE IF NOT EXISTS work_journal_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('plan','execution')),
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  actor_id TEXT NOT NULL REFERENCES work_members(id),
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(entity_type,entity_id,version)
);
ALTER TABLE work_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE work_members FROM anon, authenticated;
ALTER TABLE work_assignees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE work_assignees FROM anon, authenticated;
ALTER TABLE work_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE work_tasks FROM anon, authenticated;
ALTER TABLE work_task_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE work_task_events FROM anon, authenticated;
ALTER TABLE work_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE work_plans FROM anon, authenticated;
ALTER TABLE work_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE work_executions FROM anon, authenticated;
ALTER TABLE work_journal_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE work_journal_events FROM anon, authenticated;

ALTER TABLE work_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE work_categories FROM anon, authenticated;

ALTER TABLE work_recurrence_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE work_recurrence_rules FROM anon, authenticated;

ALTER TABLE work_recurrence_instances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE work_recurrence_instances FROM anon, authenticated;

ALTER TABLE staff_record_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE staff_record_profiles FROM anon, authenticated;

ALTER TABLE staff_record_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE staff_record_documents FROM anon, authenticated;

ALTER TABLE staff_leave_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE staff_leave_accounts FROM anon, authenticated;

ALTER TABLE staff_leave_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE staff_leave_plans FROM anon, authenticated;

ALTER TABLE staff_record_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE staff_record_events FROM anon, authenticated;

ALTER TABLE staff_record_events ADD COLUMN IF NOT EXISTS actor_id TEXT REFERENCES work_members(id);
UPDATE staff_record_events SET actor_id=owner_id WHERE actor_id IS NULL;

ALTER TABLE work_map_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE work_map_templates FROM anon, authenticated;
ALTER TABLE work_map_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE work_map_runs FROM anon, authenticated;
