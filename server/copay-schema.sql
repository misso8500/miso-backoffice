CREATE TABLE IF NOT EXISTS copay_months (
  month TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS copay_events (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL REFERENCES copay_months(month),
  version INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(month,version)
);
