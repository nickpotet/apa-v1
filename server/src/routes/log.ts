// POST /api/log — called by the kiosk at the end of each conversation.
// Stores anonymized stats; never receives raw audio or PII.
import { Router } from 'express';
import { logConversation, getDailyUsage } from '../db.js';

export const logRouter = Router();

logRouter.post('/api/log', (req, res) => {
  const { lang, trigger, duration_s, model } = req.body as Record<string, unknown>;

  if (typeof duration_s !== 'number' || duration_s <= 0) {
    res.status(400).json({ error: 'invalid duration_s' });
    return;
  }

  const cost = logConversation({
    lang:       String(lang    ?? 'unknown'),
    trigger:    String(trigger ?? 'button'),
    duration_s: Math.round(duration_s),
    model:      String(model   ?? 'unknown'),
  });

  const daily = getDailyUsage();
  console.log(`[log] +${cost.toFixed(4)}$ | daily: ${daily.count} convs / $${daily.cost_usd.toFixed(3)}`);
  res.json({ ok: true, daily });
});
