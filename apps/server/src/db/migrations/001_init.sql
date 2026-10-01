CREATE TABLE campaigns (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner       TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  launch_date TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('planned', 'in_progress', 'launched', 'cancelled')),
  reviewed_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE campaign_folders (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  folder_path TEXT NOT NULL,
  PRIMARY KEY (campaign_id, folder_path)
);

CREATE INDEX idx_campaign_folders_folder ON campaign_folders (folder_path);

CREATE TABLE folders (
  folder_path      TEXT PRIMARY KEY,
  last_poll_at     TEXT,
  last_success_at  TEXT,
  last_error       TEXT,
  last_error_at    TEXT,
  audit_readable   INTEGER CHECK (audit_readable IN (0, 1)),
  last_lower_bound TEXT
);

CREATE TABLE folder_snapshot (
  folder_path      TEXT NOT NULL,
  asset_path       TEXT NOT NULL,
  last_modified    TEXT,
  last_modified_by TEXT,
  format           TEXT,
  PRIMARY KEY (folder_path, asset_path)
);

CREATE TABLE change_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_path TEXT NOT NULL,
  asset_path  TEXT NOT NULL,
  asset_name  TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('ADDED', 'MODIFIED', 'DELETED')),
  format      TEXT,
  user        TEXT,
  user_source TEXT NOT NULL CHECK (user_source IN ('audit', 'jcr')),
  occurred_at TEXT NOT NULL,
  detected_at TEXT NOT NULL
);

CREATE INDEX idx_change_events_folder_detected ON change_events (folder_path, detected_at);
