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
