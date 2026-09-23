// Reads config at request time — edits take effect on git pull without a rebuild.
import { Router } from 'express';
import { buildGuideSystemPrompt, buildSystemPrompt, buildVenuePayload, getAppVersion } from '../prompt.js';

export const configRouter = Router();

configRouter.get('/api/config', (_req, res) => {
  try {
    res.json({
      appVersion: getAppVersion(),
      systemPrompt: buildSystemPrompt(),
      guideSystemPrompt: buildGuideSystemPrompt(),
      venue: buildVenuePayload(),
    });
  } catch (err) {
    console.error('[config]', err);
    res.status(500).json({ error: String(err) });
  }
});
