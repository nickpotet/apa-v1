import { Router } from 'express';
import { logConversation, getDailyUsage, logVoiceTurn } from '../db.js';

export const logRouter = Router();

logRouter.post('/api/log', (req, res) => {
  if (req.body?.kind === 'voice_turn') {
    console.log('[voice_turn]', JSON.stringify(req.body));
    const body = req.body as Record<string, unknown>;
    logVoiceTurn({
      turn_id: String(body.turnId ?? ''),
      app_version: typeof body.appVersion === 'string' ? body.appVersion : undefined,
      device_id: typeof body.deviceId === 'string' ? body.deviceId : undefined,
      started_at: typeof body.startedAt === 'string' ? body.startedAt : undefined,
      ended_at: typeof body.endedAt === 'string' ? body.endedAt : undefined,
      duration_ms: typeof body.durationMs === 'number' ? Math.round(body.durationMs) : undefined,
      lang: typeof body.lang === 'string' ? body.lang : undefined,
      language_lock: typeof body.languageLock === 'string' ? body.languageLock : body.languageLock === null ? null : undefined,
      trigger: typeof body.trigger === 'string' ? body.trigger : undefined,
      provider: typeof body.provider === 'string' ? body.provider : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
      error: typeof body.error === 'string' ? body.error : undefined,
      transcripts: JSON.stringify(body.transcripts ?? []),
      events: JSON.stringify(body.events ?? []),
      page_href: typeof body.page === 'object' && body.page && 'href' in body.page && typeof (body.page as { href?: unknown }).href === 'string'
        ? (body.page as { href: string }).href
        : undefined,
    });
    res.json({ ok: true, daily: getDailyUsage() });
    return;
  }

  const { appVersion, lang, trigger, duration_s, model } = req.body as Record<string, unknown>;

  if (typeof duration_s !== 'number' || duration_s <= 0) {
    res.status(400).json({ error: 'invalid duration_s' });
    return;
  }

  const cost = logConversation({
    lang:       String(lang    ?? 'unknown'),
    trigger:    String(trigger ?? 'button'),
    duration_s: Math.round(duration_s),
    model:      String(model   ?? 'unknown'),
    app_version: typeof appVersion === 'string' ? appVersion : undefined,
  });

  const daily = getDailyUsage();
  console.log(`[log] +${cost.toFixed(4)}$ | daily: ${daily.count} convs / $${daily.cost_usd.toFixed(3)}`);
  res.json({ ok: true, daily });
});
