CREATE TABLE IF NOT EXISTS work_institution_contacts (
 id TEXT PRIMARY KEY,payload TEXT NOT NULL,version INTEGER NOT NULL,
 updated_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_institution_template_settings (
 id TEXT PRIMARY KEY,payload TEXT NOT NULL,version INTEGER NOT NULL,
 updated_by TEXT NOT NULL,updated_at TEXT NOT NULL
);
