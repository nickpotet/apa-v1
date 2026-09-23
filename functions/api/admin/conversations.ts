/// <reference types="@cloudflare/workers-types" />

interface Env {
  APA_LOGS_DB?: D1Database;
  ADMIN_LOG_TOKEN?: string;
}

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

function authorize(request: Request, env: Env): Response | null {
  if (!env.ADMIN_LOG_TOKEN) return json({ error: 'ADMIN_LOG_TOKEN not configured' }, { status: 503 });
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (token !== env.ADMIN_LOG_TOKEN) return json({ error: 'unauthorized' }, { status: 401 });
  return null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const denied = authorize(request, env);
  if (denied) return denied;
  if (!env.APA_LOGS_DB) return json({ error: 'APA_LOGS_DB not configured' }, { status: 503 });

  const url = new URL(request.url);
  const after = Math.max(0, Number(url.searchParams.get('after') ?? 0) || 0);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100));

  const turns = await env.APA_LOGS_DB.prepare(`
    SELECT id, turn_id, app_version, device_id, started_at, ended_at, duration_ms, lang, language_lock,
           trigger, provider, model, status, reason, error, page_href, raw_payload, created_at
    FROM voice_turns
    WHERE id > ?
    ORDER BY id ASC
    LIMIT ?
  `).bind(after, limit).all();

  const rows = turns.results ?? [];
  return json({
    ok: true,
    after,
    limit,
    nextCursor: rows.length ? rows[rows.length - 1].id : after,
    turns: rows,
  });
};

export const onRequest: PagesFunction<Env> = async () => {
  return json({ error: 'method not allowed' }, { status: 405 });
};
