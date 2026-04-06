ALTER TABLE sessions ADD COLUMN category TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE sessions ADD COLUMN tags TEXT DEFAULT '[]';
CREATE INDEX idx_sessions_category ON sessions(category);
