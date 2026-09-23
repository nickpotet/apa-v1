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
  const format = url.searchParams.get('format') ?? 'jsonl';
  if (format !== 'jsonl') return json({ error: 'unsupported format' }, { status: 400 });

  const rows = await env.APA_LOGS_DB.prepare(`
    SELECT id, turn_id, app_version, device_id, started_at, ended_at, duration_ms, lang, language_lock,
           trigger, provider, model, status, reason, error, page_href, raw_payload, created_at
    FROM voice_turns
    ORDER BY id ASC
  `).all();

  const body = (rows.results ?? []).map((row) => JSON.stringify(row)).join('\n');
  return new Response(body ? `${body}\n` : '', {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};

export const onRequest: PagesFunction<Env> = async () => {
  return json({ error: 'method not allowed' }, { status: 405 });
};
