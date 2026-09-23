/// <reference types="@cloudflare/workers-types" />

interface Env {
  APA_LOGS_DB?: D1Database;
}

type Transcript = {
  atMs?: number;
  role?: string;
  text?: string;
};

type DiagnosticEvent = {
  atMs?: number;
  source?: string;
  event?: string;
  data?: unknown;
};

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...init?.headers,
    },
  });
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

async function saveVoiceTurn(db: D1Database, body: Record<string, unknown>) {
  const turnId = asString(body.turnId);
  if (!turnId) throw new Error('turnId missing');

  const page = objectValue(body.page);
  const transcripts = arrayValue<Transcript>(body.transcripts);
  const events = arrayValue<DiagnosticEvent>(body.events);
  const deviceId = asString(body.deviceId);
  const appVersion = asString(body.appVersion);
  const lang = asString(body.lang);
  const provider = asString(body.provider);
  const model = asString(body.model);
  const reason = asString(body.reason);
  const startedAt = asString(body.startedAt);

  const statements: D1PreparedStatement[] = [
    db.prepare(`
      INSERT INTO voice_turns (
        turn_id, app_version, device_id, started_at, ended_at, duration_ms, lang, language_lock,
        trigger, provider, model, status, reason, error, page_href, raw_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(turn_id) DO UPDATE SET
        app_version = excluded.app_version,
        ended_at = excluded.ended_at,
        duration_ms = excluded.duration_ms,
        lang = excluded.lang,
        language_lock = excluded.language_lock,
        status = excluded.status,
        reason = excluded.reason,
        error = excluded.error,
        raw_payload = excluded.raw_payload
    `).bind(
      turnId,
      appVersion,
      deviceId,
      startedAt,
      asString(body.endedAt),
      asNumber(body.durationMs),
      lang,
      body.languageLock === null ? null : asString(body.languageLock),
      asString(body.trigger),
      provider,
      model,
      asString(body.status),
      reason,
      asString(body.error),
      asString(page.href),
      JSON.stringify(body),
    ),
  ];

  for (const transcript of transcripts) {
    const text = asString(transcript.text);
    const role = asString(transcript.role);
    if (!text || !role) continue;
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO voice_messages (
        turn_id, app_version, device_id, role, text, at_ms, lang, provider, model, reason, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      turnId,
      appVersion,
      deviceId,
      role,
      text,
      asNumber(transcript.atMs),
      lang,
      provider,
      model,
      reason,
      startedAt,
    ));
  }

  for (const event of events) {
    statements.push(db.prepare(`
      INSERT INTO voice_events (turn_id, app_version, device_id, source, event, at_ms, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      turnId,
      appVersion,
      deviceId,
      asString(event.source),
      asString(event.event),
      asNumber(event.atMs),
      event.data === undefined ? null : JSON.stringify(event.data),
    ));
  }

  await db.batch(statements);
}

async function saveTranscript(db: D1Database, body: Record<string, unknown>) {
  const turnId = asString(body.turnId);
  const text = asString(body.text);
  const role = asString(body.role);
  if (!turnId || !text || !role) return;

  await db.prepare(`
    INSERT OR IGNORE INTO voice_messages (turn_id, app_version, device_id, role, text, at_ms, lang)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    turnId,
    asString(body.appVersion),
    asString(body.deviceId),
    role,
    text,
    asNumber(body.atMs),
    null,
  ).run();
}

async function saveEvent(db: D1Database, body: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO voice_events (turn_id, app_version, device_id, source, event, at_ms, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    asString(body.turnId),
    asString(body.appVersion),
    asString(body.deviceId),
    asString(body.source),
    asString(body.event),
    asNumber(body.atMs),
    body.data === undefined ? null : JSON.stringify(body.data),
  ).run();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid json' }, { status: 400 });
  }

  if (!env.APA_LOGS_DB) {
    console.warn('[pages/log] APA_LOGS_DB not configured');
    return json({ error: 'APA_LOGS_DB not configured' }, { status: 503 });
  }

  try {
    if (body.kind === 'voice_turn') {
      await saveVoiceTurn(env.APA_LOGS_DB, body);
      return json({ ok: true, stored: 'voice_turn' });
    }
    if (body.kind === 'voice_transcript') {
      await saveTranscript(env.APA_LOGS_DB, body);
      return json({ ok: true, stored: 'voice_transcript' });
    }
    if (body.kind === 'voice_event') {
      await saveEvent(env.APA_LOGS_DB, body);
      return json({ ok: true, stored: 'voice_event' });
    }
    return json({ ok: true, skipped: true });
  } catch (err) {
    console.error('[pages/log]', err);
    return json({ error: 'log write failed' }, { status: 503 });
  }
};

export const onRequest: PagesFunction = async () => {
  return json({ error: 'method not allowed' }, { status: 405 });
};
