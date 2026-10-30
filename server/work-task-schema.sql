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

CREATE TABLE IF NOT EXISTS work_visit_tasks (
  month TEXT NOT NULL,
  recipient_id TEXT NOT NULL REFERENCES recipients(id),
  task_id TEXT NOT NULL UNIQUE REFERENCES work_tasks(id),
  PRIMARY KEY(month,recipient_id)
);

CREATE TABLE IF NOT EXISTS recipient_service_pauses (
 id TEXT PRIMARY KEY,recipient_id TEXT NOT NULL REFERENCES recipients(id),start_date TEXT NOT NULL,
 expected_return_date TEXT,reason TEXT NOT NULL,returned_date TEXT,version INTEGER NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipient_active_pause ON recipient_service_pauses(recipient_id) WHERE returned_date IS NULL;
CREATE TABLE IF NOT EXISTS work_visit_holds (
 task_id TEXT NOT NULL REFERENCES work_tasks(id),pause_id TEXT NOT NULL REFERENCES recipient_service_pauses(id),released_at TEXT,
 PRIMARY KEY(task_id,pause_id)
);
CREATE TABLE IF NOT EXISTS recipient_service_pause_events (
 id TEXT PRIMARY KEY,pause_id TEXT NOT NULL REFERENCES recipient_service_pauses(id),actor_id TEXT NOT NULL REFERENCES work_members(id),
 action TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_map_templates (id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS work_map_runs (id TEXT PRIMARY KEY, run_key TEXT NOT NULL UNIQUE, work_date TEXT NOT NULL, payload TEXT NOT NULL, version INTEGER NOT NULL);
