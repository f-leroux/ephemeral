CREATE TABLE IF NOT EXISTS scores (
  day TEXT NOT NULL,
  score REAL NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS scores_day ON scores (day, score);
