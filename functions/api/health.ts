/// <reference types="@cloudflare/workers-types" />

export const onRequestGet: PagesFunction = async () => {
  return new Response(JSON.stringify({
    ok: true,
    service: 'ap-pages',
    time: new Date().toISOString(),
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};
