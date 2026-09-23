import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'data/voice-logs');
const cursorPath = resolve(outDir, '.cursor.json');
const turnsPath = resolve(outDir, 'voice_turns.jsonl');
const messagesPath = resolve(outDir, 'messages.jsonl');

function loadDotEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnvFile(resolve(root, '.env.local'));
loadDotEnvFile(resolve(root, '.dev.vars.cloudflare'));

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const watch = process.argv.includes('--watch');
const baseUrl = argValue('--base-url', process.env.APA_ADMIN_BASE_URL ?? 'https://apa-v1.pages.dev');
const token = argValue('--token', process.env.ADMIN_LOG_TOKEN);
const intervalMs = Math.max(2000, Number(argValue('--interval-ms', '10000')) || 10000);

async function readCursor() {
  try {
    const parsed = JSON.parse(await readFile(cursorPath, 'utf8'));
    return Math.max(0, Number(parsed.lastTurnId ?? 0) || 0);
  } catch {
    return 0;
  }
}

async function writeCursor(lastTurnId) {
  await writeFile(cursorPath, JSON.stringify({
    lastTurnId,
    syncedAt: new Date().toISOString(),
  }, null, 2));
}

function parseRawPayload(row) {
  if (typeof row.raw_payload !== 'string') return {};
  try {
    return JSON.parse(row.raw_payload);
  } catch {
    return {};
  }
}

function compactTurn(row) {
  const raw = parseRawPayload(row);
  return {
    id: row.id,
    turnId: row.turn_id,
    appVersion: row.app_version ?? raw.appVersion ?? null,
    deviceId: row.device_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    language: row.lang,
    languageLock: row.language_lock,
    trigger: row.trigger,
    provider: row.provider,
    model: row.model,
    status: row.status,
    reason: row.reason,
    error: row.error,
    pageHref: row.page_href,
    transcripts: Array.isArray(raw.transcripts) ? raw.transcripts : [],
    events: Array.isArray(raw.events) ? raw.events : [],
    raw,
  };
}

function compactMessages(row) {
  const raw = parseRawPayload(row);
  const transcripts = Array.isArray(raw.transcripts) ? raw.transcripts : [];
  return transcripts
    .filter((entry) => entry && typeof entry === 'object' && typeof entry.text === 'string')
    .map((entry) => ({
      turnDbId: row.id,
      turnId: row.turn_id,
      appVersion: row.app_version ?? raw.appVersion ?? null,
      startedAt: row.started_at,
      language: row.lang,
      role: entry.role,
      text: entry.text,
      atMs: entry.atMs,
      deviceId: row.device_id,
      provider: row.provider,
      model: row.model,
      reason: row.reason,
    }));
}

async function appendJsonl(path, rows) {
  if (!rows.length) return;
  await appendFile(path, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
}

async function syncOnce() {
  if (!token) {
    throw new Error('ADMIN_LOG_TOKEN is required. Set it in the environment or .env.local.');
  }

  await mkdir(outDir, { recursive: true });
  const after = await readCursor();
  const url = new URL('/api/admin/conversations', baseUrl);
  url.searchParams.set('after', String(after));
  url.searchParams.set('limit', '500');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`sync failed HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  const turns = Array.isArray(data.turns) ? data.turns : [];
  if (!turns.length) {
    console.log(`[voice-logs] no new turns after ${after}`);
    return;
  }

  await appendJsonl(turnsPath, turns.map(compactTurn));
  await appendJsonl(messagesPath, turns.flatMap(compactMessages));
  const nextCursor = Math.max(after, ...turns.map((turn) => Number(turn.id) || 0));
  await writeCursor(nextCursor);
  console.log(`[voice-logs] synced ${turns.length} turns; cursor ${nextCursor}`);
}

async function main() {
  if (!watch) {
    await syncOnce();
    return;
  }

  console.log(`[voice-logs] watching ${baseUrl} every ${intervalMs}ms`);
  for (;;) {
    try {
      await syncOnce();
    } catch (err) {
      console.error('[voice-logs]', err instanceof Error ? err.message : err);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

main().catch((err) => {
  console.error('[voice-logs]', err instanceof Error ? err.message : err);
  process.exit(1);
});
