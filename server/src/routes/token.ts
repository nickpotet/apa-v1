// Returns the voice-API token to the kiosk frontend.
// Checks the daily $-cap before issuing; returns { capped: true } when hit.
// Set VOICE_PROVIDER=openai in .env to mint OpenAI ephemeral tokens instead.
import { Router } from 'express';
import { isCapHit, getDailyUsage } from '../db.js';

const DAILY_CAP_USD  = Number(process.env.DAILY_CAP_USD  ?? 5);
const VOICE_PROVIDER = process.env.VOICE_PROVIDER ?? 'gemini';

export const tokenRouter = Router();

tokenRouter.post('/api/token', async (_req, res) => {
  if (isCapHit(DAILY_CAP_USD)) {
    const usage = getDailyUsage();
    console.warn(`[token] daily cap $${DAILY_CAP_USD} hit — ${usage.count} convs / $${usage.cost_usd.toFixed(3)}`);
    res.json({ capped: true });
    return;
  }

  if (VOICE_PROVIDER === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'OPENAI_API_KEY not configured on server' });
      return;
    }
    try {
      const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-realtime', voice: 'verse' }),
      });
      if (!r.ok) throw new Error(`OpenAI sessions ${r.status}`);
      const data = await r.json() as { client_secret: { value: string } };
      res.json({ token: data.client_secret.value, provider: 'openai' });
    } catch (err) {
      console.error('[token/openai]', err);
      res.status(502).json({ error: String(err) });
    }
    return;
  }

  // Default: Gemini — return API key directly (local device, key never leaves LAN)
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(503).json({ error: 'GEMINI_API_KEY not configured on server' });
    return;
  }
  res.json({ token: key, provider: 'gemini' });
});
