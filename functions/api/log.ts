/// <reference types="@cloudflare/workers-types" />

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

export const onRequestPost: PagesFunction = async ({ request }) => {
  try {
    const body = await request.json() as Record<string, unknown>;
    console.log('[pages/log]', {
      lang: body.lang,
      trigger: body.trigger,
      duration_s: body.duration_s,
      model: body.model,
    });
  } catch {
    return json({ error: 'invalid json' }, { status: 400 });
  }

  return json({ ok: true, daily: null });
};

export const onRequest: PagesFunction = async () => {
  return json({ error: 'method not allowed' }, { status: 405 });
};
