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
