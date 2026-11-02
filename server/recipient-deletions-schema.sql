CREATE TABLE IF NOT EXISTS recipient_deletions (
  recipient_id TEXT PRIMARY KEY REFERENCES recipients(id),
  deleted_at TEXT NOT NULL
);
