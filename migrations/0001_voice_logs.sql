CREATE TABLE IF NOT EXISTS voice_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id TEXT NOT NULL UNIQUE,
  device_id TEXT,
  started_at TEXT,
  ended_at TEXT,
  duration_ms INTEGER,
  lang TEXT,
  language_lock TEXT,
  trigger TEXT,
  provider TEXT,
  model TEXT,
  status TEXT,
  reason TEXT,
  error TEXT,
  page_href TEXT,
  raw_payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS voice_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id TEXT NOT NULL,
  device_id TEXT,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  at_ms INTEGER,
  lang TEXT,
  provider TEXT,
  model TEXT,
  reason TEXT,
  started_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(turn_id, role, at_ms, text)
);

CREATE TABLE IF NOT EXISTS voice_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id TEXT,
  device_id TEXT,
  source TEXT,
  event TEXT,
  at_ms INTEGER,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voice_turns_id ON voice_turns(id);
CREATE INDEX IF NOT EXISTS idx_voice_turns_started_at ON voice_turns(started_at);
CREATE INDEX IF NOT EXISTS idx_voice_messages_turn_id ON voice_messages(turn_id);
CREATE INDEX IF NOT EXISTS idx_voice_events_turn_id ON voice_events(turn_id);
