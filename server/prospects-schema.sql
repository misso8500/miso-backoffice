CREATE TABLE IF NOT EXISTS work_prospects (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_prospect_events (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES work_prospects(id),
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES work_members(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_work_prospect_events ON work_prospect_events(prospect_id,created_at,id);
