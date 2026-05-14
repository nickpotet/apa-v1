// Returns the list of available attract-mode audio clips per language.
// Frontend uses this to pick random clips without hardcoding filenames.
import { Router } from 'express';
import { readdirSync } from 'fs';
import { resolve } from 'path';
import { ATTRACT_DIR } from '../paths.js';

const LANGS = ['es', 'en', 'ru', 'ca'] as const;

export const attractRouter = Router();

attractRouter.get('/api/attract-manifest', (_req, res) => {
  const manifest: Record<string, string[]> = {};
  for (const lang of LANGS) {
    try {
      manifest[lang] = readdirSync(resolve(ATTRACT_DIR, lang))
        .filter((f) => f.endsWith('.mp3'))
        .sort();
    } catch {
      manifest[lang] = [];
    }
  }
  res.json(manifest);
});
