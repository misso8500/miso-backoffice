CREATE TABLE IF NOT EXISTS recipient_plan_imports (
 source_key TEXT PRIMARY KEY,recipient_id TEXT NOT NULL REFERENCES recipients(id),
 plan_id TEXT NOT NULL,source_hash TEXT NOT NULL,source_payload TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipient_plan_imports_person ON recipient_plan_imports(recipient_id);
