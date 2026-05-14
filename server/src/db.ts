// Local SQLite store — never leaves the kiosk mini-PC.
// Logs anonymized events (no raw audio, no PII) and enforces the daily $-cap.
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
    cost_usd    REAL
  );
`);

// Conservative cost-per-second estimates (audio in + audio out blended).
// Update when switching providers.
const COST_PER_SECOND: Record<string, number> = {
  'gemini-3.1-flash-live-preview': 0.00012, // ~$0.01 / 90s
  'gpt-realtime':                  0.003,   // ~$0.27 / 90s
};

interface ConvLog {
  lang:       string;
  trigger:    string;
  duration_s: number;
  model:      string;
}

const stmtInsert = db.prepare(`
  INSERT INTO conversations (lang, trigger, duration_s, model, cost_usd)
  VALUES (@lang, @trigger, @duration_s, @model, @cost_usd)
`);

const stmtDaily = db.prepare(`
  SELECT COUNT(*)            AS count,
         COALESCE(SUM(cost_usd), 0) AS cost_usd
  FROM conversations
  WHERE date(started_at) = date('now')
`);

export function logConversation(opts: ConvLog) {
  const cost_usd = (COST_PER_SECOND[opts.model] ?? 0.001) * opts.duration_s;
  stmtInsert.run({ ...opts, cost_usd });
  return cost_usd;
}

export function getDailyUsage(): { count: number; cost_usd: number } {
  return stmtDaily.get() as { count: number; cost_usd: number };
}

export function isCapHit(capUsd: number): boolean {
  return getDailyUsage().cost_usd >= capUsd;
}
