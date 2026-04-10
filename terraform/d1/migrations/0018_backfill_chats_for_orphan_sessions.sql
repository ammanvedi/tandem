-- Backfill: create a Chat wrapper for every session that doesn't have one.
-- Each orphan session gets its own chat with a single-cluster canvas state.

INSERT INTO chats (id, title, repo_owner, repo_name, status, canvas_state, created_at, updated_at)
SELECT
  s.id || '-chat',
  s.title,
  s.repo_owner,
  s.repo_name,
  CASE WHEN s.status IN ('completed', 'stopped', 'failed', 'stale') THEN 'archived' ELSE 'active' END,
  '{"clusters":[{"sessionId":"' || s.id || '","position":[0,0]}]}',
  s.created_at,
  s.updated_at
FROM sessions s
WHERE s.chat_id IS NULL;

UPDATE sessions
SET chat_id = id || '-chat',
    updated_at = unixepoch() * 1000
WHERE chat_id IS NULL;
