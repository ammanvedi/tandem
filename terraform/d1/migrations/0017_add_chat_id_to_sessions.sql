ALTER TABLE sessions ADD COLUMN chat_id TEXT REFERENCES chats(id);

CREATE INDEX IF NOT EXISTS idx_sessions_chat_id ON sessions (chat_id);
