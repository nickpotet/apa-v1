import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { DATA_DIR } from './paths.js';
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(resolve(DATA_DIR, 'events.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    lang        TEXT,
    trigger     TEXT,
    duration_s  INTEGER,
    model       TEXT,
    app_version TEXT,
    cost_usd    REAL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS voice_turns (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    turn_id       TEXT    NOT NULL,
    app_version   TEXT,
    device_id     TEXT,
    started_at    TEXT,
    ended_at      TEXT,
    duration_ms   INTEGER,
    lang          TEXT,
    language_lock TEXT,
    trigger       TEXT,
    provider      TEXT,
    model         TEXT,
    status        TEXT,
    reason        TEXT,
    error         TEXT,
    transcripts   TEXT    NOT NULL,
    events        TEXT    NOT NULL,
    page_href     TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

function ensureColumn(table: 'conversations' | 'voice_turns', column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('conversations', 'app_version', 'TEXT');
ensureColumn('voice_turns', 'app_version', 'TEXT');

// Conservative blended estimates (audio in + out). Update when switching providers.
const COST_PER_SECOND: Record<string, number> = {
  'gemini-3.1-flash-live-preview': 0.00012, // ~$0.01 / 90s
  'gpt-4o-realtime-preview-2024-12-17': 0.003, // ~$0.27 / 90s
};

interface ConvLog {
  lang:       string;
  trigger:    string;
  duration_s: number;
  model:      string;
  app_version?: string;
}

const stmtInsert = db.prepare(`
  INSERT INTO conversations (lang, trigger, duration_s, model, app_version, cost_usd)
  VALUES (@lang, @trigger, @duration_s, @model, @app_version, @cost_usd)
`);

const stmtDaily = db.prepare(`
  SELECT COUNT(*)            AS count,
         COALESCE(SUM(cost_usd), 0) AS cost_usd
  FROM conversations
  WHERE date(started_at) = date('now')
`);

const stmtInsertVoiceTurn = db.prepare(`
  INSERT INTO voice_turns (
    turn_id, app_version, device_id, started_at, ended_at, duration_ms, lang, language_lock,
    trigger, provider, model, status, reason, error, transcripts, events, page_href
  ) VALUES (
    @turn_id, @app_version, @device_id, @started_at, @ended_at, @duration_ms, @lang, @language_lock,
    @trigger, @provider, @model, @status, @reason, @error, @transcripts, @events, @page_href
  )
`);

export function logConversation(opts: ConvLog) {
  const cost_usd = (COST_PER_SECOND[opts.model] ?? 0.001) * opts.duration_s;
  stmtInsert.run({ ...opts, app_version: opts.app_version ?? null, cost_usd });
  return cost_usd;
}

export function getDailyUsage(): { count: number; cost_usd: number } {
  return stmtDaily.get() as { count: number; cost_usd: number };
}

export function isCapHit(capUsd: number): boolean {
  return getDailyUsage().cost_usd >= capUsd;
}

interface VoiceTurnLog {
  turn_id: string;
  app_version?: string;
  device_id?: string;
  started_at?: string;
  ended_at?: string;
  duration_ms?: number;
  lang?: string;
  language_lock?: string | null;
  trigger?: string;
  provider?: string;
  model?: string;
  status?: string;
  reason?: string;
  error?: string;
  transcripts: string;
  events: string;
  page_href?: string;
}

export function logVoiceTurn(turn: VoiceTurnLog): void {
  stmtInsertVoiceTurn.run({
    turn_id: turn.turn_id,
    app_version: turn.app_version ?? null,
    device_id: turn.device_id ?? null,
    started_at: turn.started_at ?? null,
    ended_at: turn.ended_at ?? null,
    duration_ms: turn.duration_ms ?? null,
    lang: turn.lang ?? null,
    language_lock: turn.language_lock ?? null,
    trigger: turn.trigger ?? null,
    provider: turn.provider ?? null,
    model: turn.model ?? null,
    status: turn.status ?? null,
    reason: turn.reason ?? null,
    error: turn.error ?? null,
    transcripts: turn.transcripts,
    events: turn.events,
    page_href: turn.page_href ?? null,
  });
}
