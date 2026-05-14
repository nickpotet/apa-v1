// Assembles and returns the full system prompt + venue config.
// Reads /config/*.json and ap_persona.md at request time so edits take
// effect on next git pull without a rebuild.
import { Router } from 'express';
import { buildSystemPrompt, buildVenuePayload } from '../prompt.js';

export const configRouter = Router();

configRouter.get('/api/config', (_req, res) => {
  try {
    res.json({
      systemPrompt: buildSystemPrompt(),
      venue: buildVenuePayload(),
    });
  } catch (err) {
    console.error('[config]', err);
    res.status(500).json({ error: String(err) });
  }
});
