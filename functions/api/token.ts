/// <reference types="@cloudflare/workers-types" />

import { GoogleGenAI } from '@google/genai';

interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

const DEFAULT_MODEL = 'gemini-3.1-flash-live-preview';

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

export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  if (!env.GEMINI_API_KEY) {
    return json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
  }

  const model = env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const expireTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  try {
    const client = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime: new Date(Date.now() + 60 * 1000),
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: ['AUDIO'],
            temperature: 0.7,
          },
        },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });

    return json({ token: token.name, provider: 'gemini', expiresAt: expireTime });
  } catch (err) {
    console.error('[pages/token]', err);
    return json({ error: 'token mint failed' }, { status: 502 });
  }
};

export const onRequest: PagesFunction<Env> = async () => {
  return json({ error: 'method not allowed' }, { status: 405 });
};
