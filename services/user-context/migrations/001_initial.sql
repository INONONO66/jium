CREATE TABLE IF NOT EXISTS profiles (
  user_id text PRIMARY KEY,
  display_name text,
  timezone text NOT NULL,
  locale text NOT NULL,
  home_location text,
  work_location text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id text PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_events (
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  id text NOT NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT calendar_events_valid_window CHECK (ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS sessions (
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  id text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  current_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS ambient_context_events (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  type text NOT NULL,
  timestamp timestamptz NOT NULL,
  importance text NOT NULL,
  summary text NOT NULL,
  raw_transcript jsonb NOT NULL,
  suggested_actions text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ambient_context_events_type_check CHECK (type = 'ambient_audio_context'),
  CONSTRAINT ambient_context_events_importance_check CHECK (importance IN ('low', 'medium', 'high'))
);

CREATE INDEX IF NOT EXISTS calendar_events_user_starts_at_idx
  ON calendar_events (user_id, starts_at);

CREATE INDEX IF NOT EXISTS calendar_events_user_ends_at_idx
  ON calendar_events (user_id, ends_at);

CREATE INDEX IF NOT EXISTS sessions_user_last_seen_at_idx
  ON sessions (user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS ambient_context_events_timestamp_idx
  ON ambient_context_events (timestamp DESC);

CREATE INDEX IF NOT EXISTS ambient_context_events_user_timestamp_idx
  ON ambient_context_events (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS preferences_preferences_gin_idx
  ON preferences USING gin (preferences);

CREATE INDEX IF NOT EXISTS sessions_current_context_gin_idx
  ON sessions USING gin (current_context);

CREATE INDEX IF NOT EXISTS ambient_context_events_raw_transcript_gin_idx
  ON ambient_context_events USING gin (raw_transcript);
