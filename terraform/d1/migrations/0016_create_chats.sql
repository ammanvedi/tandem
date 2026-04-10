CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  title TEXT,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  canvas_state TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chats_status_updated
  ON chats (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chats_repo
  ON chats (repo_owner, repo_name, updated_at DESC);
