ALTER TABLE voice_turns ADD COLUMN app_version TEXT;
ALTER TABLE voice_messages ADD COLUMN app_version TEXT;
ALTER TABLE voice_events ADD COLUMN app_version TEXT;

CREATE INDEX IF NOT EXISTS idx_voice_turns_app_version ON voice_turns(app_version);
